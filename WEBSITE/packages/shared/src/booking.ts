/**
 * The booking transaction.
 *
 * Availability (scheduling.ts) is ADVISORY — it reflects the world a moment ago.
 * This file is AUTHORITATIVE. Two customers submitting for the last slot in the
 * same second must produce exactly one booking and one 409.
 *
 * How: every crew-day is a document with a DETERMINISTIC id (`${crewId}_${date}`),
 * so the transaction reads known documents rather than running a query. Firestore
 * guarantees that if any of those documents changes between read and commit, the
 * transaction retries. That is the whole concurrency story — no locks, no queue.
 */

import crypto from 'node:crypto';
import { COL, db } from './firebase.js';
import {
  blocksForBooking, candidateCrews, crewDayId, datesSpanned, datesToInspect,
  fits, isoDate, occupancyFor,
} from './scheduling.js';
import { computePayout } from './pricing.js';
import { loadCrewDays, nextSequence, notify } from './repos.js';
import type {
  Booking, CrewDay, Crew, ISODate, Millis, PricingBlock, SchedulingSettings,
} from './types.js';

/* ------------------------------ tokens ---------------------------- */

export function makeToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`sunnclean:${ip}`).digest('hex').slice(0, 24);
}

/* --------------------------- create booking ----------------------- */

export interface CreateBookingInput {
  start: Millis;
  durationMinutes: number;
  crews: Crew[];
  settings: SchedulingSettings;
  timezone: string;
  pricing: PricingBlock;
  customer: Booking['customer'];
  site: Booking['site'];
  property: Booking['property'];
  service: Booking['service'];
  addOns: Booking['addOns'];
  source: Booking['meta']['source'];
  createdByUid?: string;
  /** Force a specific crew (admin creating a booking by hand). */
  forceCrewId?: string;
}

export type CreateBookingResult =
  | { ok: true; bookingId: string; bookingNumber: string; lookupToken: string; crewId: string; crewName: string }
  | { ok: false; reason: 'no_availability' | 'crew_unavailable' | 'invalid' };

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const {
    start, durationMinutes, crews, settings, timezone, pricing,
    customer, site, property, service, addOns, source, createdByUid, forceCrewId,
  } = input;

  if (!(durationMinutes > 0) || !(start > 0)) return { ok: false, reason: 'invalid' };

  const end = start + durationMinutes * 60_000;
  const spanned = datesSpanned(start, end, timezone);
  const inspect = datesToInspect(start, end, timezone);

  // Pre-filter with a non-transactional read to pick a sensible crew order.
  const preload = await loadCrewDays(crews.map((c) => c.id), inspect);
  const ordered = forceCrewId
    ? crews.filter((c) => c.id === forceCrewId)
    : candidateCrews({ start, durationMinutes, crews, crewDays: preload, settings, timezone });

  if (ordered.length === 0) {
    return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };
  }

  const lookupToken = makeToken();
  const bookingNumber = await nextSequence('bookings', 'SC');

  for (const crew of ordered) {
    const attempt = await tryCommit(crew);
    if (attempt) {
      await notify({
        type: 'new_booking',
        severity: 'action',
        title: `New booking — ${customer.businessName || customer.contactName}`,
        body: `${service.serviceName} · ${new Date(start).toISOString()} · ${pricing.finalTotal.toFixed(2)}`,
        link: `/bookings/${attempt}`,
        relatedId: attempt,
      });
      if (service.recurringInterest) {
        await notify({
          id: `recurring_${attempt}`,
          type: 'recurring_lead',
          severity: 'info',
          title: `Recurring contract lead — ${customer.businessName || customer.contactName}`,
          body: `Asked about ${service.recurringFrequencyLabel}. Booked as a one-time job; follow up with contract pricing.`,
          link: `/bookings/${attempt}`,
          relatedId: attempt,
        });
      }
      return {
        ok: true, bookingId: attempt, bookingNumber, lookupToken,
        crewId: crew.id, crewName: crew.name,
      };
    }
  }

  return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };

  /** Returns the booking id on success, null if this crew lost the race. */
  async function tryCommit(crew: Crew): Promise<string | null> {
    const bookingRef = db().collection(COL.bookings).doc();
    const dayRefs = inspect.map((d) => db().collection(COL.crewDays).doc(crewDayId(crew.id, d)));

    try {
      await db().runTransaction(async (tx) => {
        // RULE 3: read D-1, D, D+1 — always, not just when crossing midnight.
        const snaps = await tx.getAll(...dayRefs);
        const map = new Map<string, CrewDay>();
        snaps.forEach((s) => {
          if (s.exists) map.set(s.id, { id: s.id, ...(s.data() as object) } as CrewDay);
        });

        const existing = occupancyFor(crew.id, inspect, map);
        if (!fits({ start, end }, existing, settings.travelBufferMinutes)) {
          throw new ConflictError();
        }

        const nowMs = Date.now();
        const booking: Omit<Booking, 'id'> = {
          bookingNumber,
          status: settings.autoConfirmBookings ? 'confirmed' : 'pending',
          customer, site, property, service, addOns,
          schedule: {
            serviceStart: start,
            serviceEnd: end,
            estimatedDurationMinutes: durationMinutes,
            travelBufferMinutes: settings.travelBufferMinutes,
            crewId: crew.id,
            crewName: crew.name,
            quotingHeadcountAtBooking: settings.quotingCrewHeadcount,
            timezone,
            dates: spanned,
          },
          pricing,
          completion: {},
          payout: { computedAmount: 0, paid: false },
          requests: {
            cancellationRequested: false, rescheduleRequested: false, requestNote: '',
          },
          meta: {
            lookupTokenHash: hashToken(lookupToken),
            createdAt: nowMs,
            updatedAt: nowMs,
            source,
            createdByUid,
          },
        };

        tx.set(bookingRef, booking);

        // Write a block to every day the SERVICE window touches.
        const label = customer.businessName || customer.contactName || 'Booking';
        for (const { date, block } of blocksForBooking(bookingRef.id, label, start, end, timezone)) {
          const ref = db().collection(COL.crewDays).doc(crewDayId(crew.id, date));
          const prior = map.get(crewDayId(crew.id, date));
          tx.set(ref, {
            crewId: crew.id,
            date,
            blocks: [...(prior?.blocks ?? []), block],
            updatedAt: nowMs,
          }, { merge: true });
        }
      });
      return bookingRef.id;
    } catch (err) {
      if (err instanceof ConflictError) return null;
      throw err;
    }
  }
}

class ConflictError extends Error {
  constructor() { super('slot_taken'); this.name = 'ConflictError'; }
}

/* ------------------------- release / reschedule -------------------- */

/** Remove a booking's blocks from every crew-day that holds them. */
export async function releaseBlocks(
  bookingId: string, crewId: string, dates: ISODate[],
): Promise<void> {
  const batch = db().batch();
  for (const date of dates) {
    const ref = db().collection(COL.crewDays).doc(crewDayId(crewId, date));
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() as CrewDay;
    const blocks = (data.blocks ?? []).filter((b) => b.bookingId !== bookingId);
    batch.set(ref, { blocks, updatedAt: Date.now() }, { merge: true });
  }
  await batch.commit();
}

export type RescheduleResult =
  | { ok: true; crewId: string; crewName: string }
  | { ok: false; reason: 'no_availability' | 'crew_unavailable' | 'not_found' };

/**
 * Move or reassign a booking. Runs the same validation as creation: release the
 * old blocks, then re-validate and write the new ones. If nothing can take the
 * new slot the old blocks are restored, so a failed reschedule is a no-op.
 */
export async function rescheduleBooking(opts: {
  booking: Booking;
  newStart: Millis;
  newDurationMinutes?: number;
  crews: Crew[];
  settings: SchedulingSettings;
  timezone: string;
  forceCrewId?: string;
}): Promise<RescheduleResult> {
  const { booking, newStart, crews, settings, timezone, forceCrewId } = opts;
  const duration = opts.newDurationMinutes ?? booking.schedule.estimatedDurationMinutes;
  const newEnd = newStart + duration * 60_000;
  const inspect = datesToInspect(newStart, newEnd, timezone);

  const oldCrewId = booking.schedule.crewId;
  const oldDates = booking.schedule.dates ?? datesSpanned(
    booking.schedule.serviceStart, booking.schedule.serviceEnd, timezone);

  // Exclude this booking from its own occupancy so a nudge of 15 minutes works.
  const preload = await loadCrewDays(crews.map((c) => c.id), inspect);
  const ordered = forceCrewId
    ? crews.filter((c) => c.id === forceCrewId)
    : candidateCrews({
        start: newStart, durationMinutes: duration, crews,
        crewDays: preload, settings, timezone, excludeBookingId: booking.id,
      });

  if (ordered.length === 0) {
    return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };
  }

  for (const crew of ordered) {
    const dayRefs = inspect.map((d) => db().collection(COL.crewDays).doc(crewDayId(crew.id, d)));
    try {
      await db().runTransaction(async (tx) => {
        const snaps = await tx.getAll(...dayRefs);
        const map = new Map<string, CrewDay>();
        snaps.forEach((s) => {
          if (s.exists) map.set(s.id, { id: s.id, ...(s.data() as object) } as CrewDay);
        });

        const existing = occupancyFor(crew.id, inspect, map, booking.id);
        if (!fits({ start: newStart, end: newEnd }, existing, settings.travelBufferMinutes)) {
          throw new ConflictError();
        }

        const nowMs = Date.now();
        const newDates = datesSpanned(newStart, newEnd, timezone);
        const label = booking.customer.businessName || booking.customer.contactName || 'Booking';

        // Drop old blocks on the target crew's inspected days first, so moving
        // within the same crew never leaves a duplicate behind.
        for (const [id, day] of map) {
          const filtered = (day.blocks ?? []).filter((b) => b.bookingId !== booking.id);
          if (filtered.length !== (day.blocks ?? []).length) {
            tx.set(db().collection(COL.crewDays).doc(id),
              { blocks: filtered, updatedAt: nowMs }, { merge: true });
            map.set(id, { ...day, blocks: filtered });
          }
        }

        for (const date of newDates) {
          const id = crewDayId(crew.id, date);
          const prior = map.get(id);
          const kept = (prior?.blocks ?? []).filter((b) => b.bookingId !== booking.id);
          tx.set(db().collection(COL.crewDays).doc(id), {
            crewId: crew.id, date,
            blocks: [...kept, { bookingId: booking.id, start: newStart, end: newEnd, label }],
            updatedAt: nowMs,
          }, { merge: true });
        }

        tx.set(db().collection(COL.bookings).doc(booking.id), {
          schedule: {
            ...booking.schedule,
            serviceStart: newStart,
            serviceEnd: newEnd,
            estimatedDurationMinutes: duration,
            crewId: crew.id,
            crewName: crew.name,
            dates: newDates,
          },
          requests: { ...booking.requests, rescheduleRequested: false },
          meta: { ...booking.meta, updatedAt: nowMs },
        }, { merge: true });
      });

      // Old crew's blocks (only when the crew changed — same-crew days were
      // handled inside the transaction above).
      if (oldCrewId !== crew.id) {
        await releaseBlocks(booking.id, oldCrewId, oldDates);
      } else {
        const stale = oldDates.filter((d) => !inspect.includes(d));
        if (stale.length) await releaseBlocks(booking.id, oldCrewId, stale);
      }

      return { ok: true, crewId: crew.id, crewName: crew.name };
    } catch (err) {
      if (err instanceof ConflictError) continue;
      throw err;
    }
  }

  return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };
}

/**
 * Cancel: free the slot immediately. Blocks are removed ONLY here and on
 * reschedule — never in response to a status change, because a job marked
 * complete at 14:00 while the crew is still on site must keep holding its slot.
 */
export async function cancelBooking(booking: Booking, byUid?: string): Promise<void> {
  const dates = booking.schedule.dates ?? datesSpanned(
    booking.schedule.serviceStart, booking.schedule.serviceEnd, booking.schedule.timezone);
  await releaseBlocks(booking.id, booking.schedule.crewId, dates);
  await db().collection(COL.bookings).doc(booking.id).set({
    status: 'cancelled',
    meta: { ...booking.meta, updatedAt: Date.now() },
    ...(byUid ? { cancelledByUid: byUid } : {}),
  }, { merge: true });
}

/* --------------------------- completion --------------------------- */

export async function markComplete(opts: {
  booking: Booking;
  crew: Crew | null;
  actualStart?: Millis;
  actualEnd?: Millis;
  crewNotes?: string;
  byUid: string;
}): Promise<void> {
  const { booking, crew, crewNotes, byUid } = opts;
  const actualStart = opts.actualStart ?? booking.schedule.serviceStart;
  const actualEnd = opts.actualEnd ?? booking.schedule.serviceEnd;
  const hours = Math.max(0, (actualEnd - actualStart) / 3_600_000);
  const headcount = crew?.headcount ?? booking.schedule.quotingHeadcountAtBooking ?? 1;
  const payout = computePayout(hours, headcount, crew?.hourlyCostPerCleaner ?? 0);

  const reviewToken = makeToken();

  await db().collection(COL.bookings).doc(booking.id).set({
    status: 'completed',
    completion: {
      markedCompleteAt: Date.now(),
      markedCompleteBy: byUid,
      actualStart, actualEnd,
      actualLaborHours: Math.round(hours * 100) / 100,
      crewNotes: crewNotes ?? '',
      photoPaths: booking.completion?.photoPaths ?? [],
    },
    payout: { ...booking.payout, computedAmount: payout },
    meta: { ...booking.meta, reviewTokenHash: hashToken(reviewToken), updatedAt: Date.now() },
  }, { merge: true });

  // Clear the "did this happen?" nudge, raise the "send an invoice" one.
  await notify({
    id: `invoice_needed_${booking.id}`,
    type: 'invoice_needed',
    severity: 'action',
    title: `Invoice needed — ${booking.customer.businessName || booking.customer.contactName}`,
    body: `${booking.service.serviceName} completed · ${booking.pricing.finalTotal.toFixed(2)}`,
    link: `/bookings/${booking.id}`,
    relatedId: booking.id,
  });

  await db().collection(COL.notifications).doc(`needs_completion_${booking.id}`)
    .delete().catch(() => {});

  // Stash the plaintext review token so admin can copy the link.
  await db().collection(COL.bookings).doc(booking.id)
    .set({ reviewTokenPlain: reviewToken }, { merge: true });
}

export { isoDate };
