"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isoDate = void 0;
exports.makeToken = makeToken;
exports.hashToken = hashToken;
exports.hashIp = hashIp;
exports.createBooking = createBooking;
exports.releaseBlocks = releaseBlocks;
exports.rescheduleBooking = rescheduleBooking;
exports.cancelBooking = cancelBooking;
exports.markComplete = markComplete;
const node_crypto_1 = __importDefault(require("node:crypto"));
const firebase_js_1 = require("./firebase.js");
const scheduling_js_1 = require("./scheduling.js");
Object.defineProperty(exports, "isoDate", { enumerable: true, get: function () { return scheduling_js_1.isoDate; } });
const pricing_js_1 = require("./pricing.js");
const repos_js_1 = require("./repos.js");
/* ------------------------------ tokens ---------------------------- */
function makeToken() {
    return node_crypto_1.default.randomBytes(32).toString('base64url');
}
function hashToken(token) {
    return node_crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function hashIp(ip) {
    return node_crypto_1.default.createHash('sha256').update(`sunnclean:${ip}`).digest('hex').slice(0, 24);
}
async function createBooking(input) {
    const { start, durationMinutes, crews, settings, timezone, pricing, customer, site, property, service, addOns, source, createdByUid, forceCrewId, } = input;
    if (!(durationMinutes > 0) || !(start > 0))
        return { ok: false, reason: 'invalid' };
    const end = start + durationMinutes * 60_000;
    const spanned = (0, scheduling_js_1.datesSpanned)(start, end, timezone);
    const inspect = (0, scheduling_js_1.datesToInspect)(start, end, timezone);
    // Pre-filter with a non-transactional read to pick a sensible crew order.
    const preload = await (0, repos_js_1.loadCrewDays)(crews.map((c) => c.id), inspect);
    const ordered = forceCrewId
        ? crews.filter((c) => c.id === forceCrewId)
        : (0, scheduling_js_1.candidateCrews)({ start, durationMinutes, crews, crewDays: preload, settings, timezone });
    if (ordered.length === 0) {
        return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };
    }
    const lookupToken = makeToken();
    const bookingNumber = await (0, repos_js_1.nextSequence)('bookings', 'SC');
    for (const crew of ordered) {
        const attempt = await tryCommit(crew);
        if (attempt) {
            await (0, repos_js_1.notify)({
                type: 'new_booking',
                severity: 'action',
                title: `New booking — ${customer.businessName || customer.contactName}`,
                body: `${service.serviceName} · ${new Date(start).toISOString()} · ${pricing.finalTotal.toFixed(2)}`,
                link: `/bookings/${attempt}`,
                relatedId: attempt,
            });
            if (service.recurringInterest) {
                await (0, repos_js_1.notify)({
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
    async function tryCommit(crew) {
        const bookingRef = (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc();
        const dayRefs = inspect.map((d) => (0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc((0, scheduling_js_1.crewDayId)(crew.id, d)));
        try {
            await (0, firebase_js_1.db)().runTransaction(async (tx) => {
                // RULE 3: read D-1, D, D+1 — always, not just when crossing midnight.
                const snaps = await tx.getAll(...dayRefs);
                const map = new Map();
                snaps.forEach((s) => {
                    if (s.exists)
                        map.set(s.id, { id: s.id, ...s.data() });
                });
                const existing = (0, scheduling_js_1.occupancyFor)(crew.id, inspect, map);
                if (!(0, scheduling_js_1.fits)({ start, end }, existing, settings.travelBufferMinutes)) {
                    throw new ConflictError();
                }
                const nowMs = Date.now();
                const booking = {
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
                for (const { date, block } of (0, scheduling_js_1.blocksForBooking)(bookingRef.id, label, start, end, timezone)) {
                    const ref = (0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc((0, scheduling_js_1.crewDayId)(crew.id, date));
                    const prior = map.get((0, scheduling_js_1.crewDayId)(crew.id, date));
                    tx.set(ref, {
                        crewId: crew.id,
                        date,
                        blocks: [...(prior?.blocks ?? []), block],
                        updatedAt: nowMs,
                    }, { merge: true });
                }
            });
            return bookingRef.id;
        }
        catch (err) {
            if (err instanceof ConflictError)
                return null;
            throw err;
        }
    }
}
class ConflictError extends Error {
    constructor() { super('slot_taken'); this.name = 'ConflictError'; }
}
/* ------------------------- release / reschedule -------------------- */
/** Remove a booking's blocks from every crew-day that holds them. */
async function releaseBlocks(bookingId, crewId, dates) {
    const batch = (0, firebase_js_1.db)().batch();
    for (const date of dates) {
        const ref = (0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc((0, scheduling_js_1.crewDayId)(crewId, date));
        const snap = await ref.get();
        if (!snap.exists)
            continue;
        const data = snap.data();
        const blocks = (data.blocks ?? []).filter((b) => b.bookingId !== bookingId);
        batch.set(ref, { blocks, updatedAt: Date.now() }, { merge: true });
    }
    await batch.commit();
}
/**
 * Move or reassign a booking. Runs the same validation as creation: release the
 * old blocks, then re-validate and write the new ones. If nothing can take the
 * new slot the old blocks are restored, so a failed reschedule is a no-op.
 */
async function rescheduleBooking(opts) {
    const { booking, newStart, crews, settings, timezone, forceCrewId } = opts;
    const duration = opts.newDurationMinutes ?? booking.schedule.estimatedDurationMinutes;
    const newEnd = newStart + duration * 60_000;
    const inspect = (0, scheduling_js_1.datesToInspect)(newStart, newEnd, timezone);
    const oldCrewId = booking.schedule.crewId;
    const oldDates = booking.schedule.dates ?? (0, scheduling_js_1.datesSpanned)(booking.schedule.serviceStart, booking.schedule.serviceEnd, timezone);
    // Exclude this booking from its own occupancy so a nudge of 15 minutes works.
    const preload = await (0, repos_js_1.loadCrewDays)(crews.map((c) => c.id), inspect);
    const ordered = forceCrewId
        ? crews.filter((c) => c.id === forceCrewId)
        : (0, scheduling_js_1.candidateCrews)({
            start: newStart, durationMinutes: duration, crews,
            crewDays: preload, settings, timezone, excludeBookingId: booking.id,
        });
    if (ordered.length === 0) {
        return { ok: false, reason: forceCrewId ? 'crew_unavailable' : 'no_availability' };
    }
    for (const crew of ordered) {
        const dayRefs = inspect.map((d) => (0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc((0, scheduling_js_1.crewDayId)(crew.id, d)));
        try {
            await (0, firebase_js_1.db)().runTransaction(async (tx) => {
                const snaps = await tx.getAll(...dayRefs);
                const map = new Map();
                snaps.forEach((s) => {
                    if (s.exists)
                        map.set(s.id, { id: s.id, ...s.data() });
                });
                const existing = (0, scheduling_js_1.occupancyFor)(crew.id, inspect, map, booking.id);
                if (!(0, scheduling_js_1.fits)({ start: newStart, end: newEnd }, existing, settings.travelBufferMinutes)) {
                    throw new ConflictError();
                }
                const nowMs = Date.now();
                const newDates = (0, scheduling_js_1.datesSpanned)(newStart, newEnd, timezone);
                const label = booking.customer.businessName || booking.customer.contactName || 'Booking';
                // Drop old blocks on the target crew's inspected days first, so moving
                // within the same crew never leaves a duplicate behind.
                for (const [id, day] of map) {
                    const filtered = (day.blocks ?? []).filter((b) => b.bookingId !== booking.id);
                    if (filtered.length !== (day.blocks ?? []).length) {
                        tx.set((0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc(id), { blocks: filtered, updatedAt: nowMs }, { merge: true });
                        map.set(id, { ...day, blocks: filtered });
                    }
                }
                for (const date of newDates) {
                    const id = (0, scheduling_js_1.crewDayId)(crew.id, date);
                    const prior = map.get(id);
                    const kept = (prior?.blocks ?? []).filter((b) => b.bookingId !== booking.id);
                    tx.set((0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc(id), {
                        crewId: crew.id, date,
                        blocks: [...kept, { bookingId: booking.id, start: newStart, end: newEnd, label }],
                        updatedAt: nowMs,
                    }, { merge: true });
                }
                tx.set((0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(booking.id), {
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
            }
            else {
                const stale = oldDates.filter((d) => !inspect.includes(d));
                if (stale.length)
                    await releaseBlocks(booking.id, oldCrewId, stale);
            }
            return { ok: true, crewId: crew.id, crewName: crew.name };
        }
        catch (err) {
            if (err instanceof ConflictError)
                continue;
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
async function cancelBooking(booking, byUid) {
    const dates = booking.schedule.dates ?? (0, scheduling_js_1.datesSpanned)(booking.schedule.serviceStart, booking.schedule.serviceEnd, booking.schedule.timezone);
    await releaseBlocks(booking.id, booking.schedule.crewId, dates);
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(booking.id).set({
        status: 'cancelled',
        meta: { ...booking.meta, updatedAt: Date.now() },
        ...(byUid ? { cancelledByUid: byUid } : {}),
    }, { merge: true });
}
/* --------------------------- completion --------------------------- */
async function markComplete(opts) {
    const { booking, crew, crewNotes, byUid } = opts;
    const actualStart = opts.actualStart ?? booking.schedule.serviceStart;
    const actualEnd = opts.actualEnd ?? booking.schedule.serviceEnd;
    const hours = Math.max(0, (actualEnd - actualStart) / 3_600_000);
    const headcount = crew?.headcount ?? booking.schedule.quotingHeadcountAtBooking ?? 1;
    const payout = (0, pricing_js_1.computePayout)(hours, headcount, crew?.hourlyCostPerCleaner ?? 0);
    const reviewToken = makeToken();
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(booking.id).set({
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
    await (0, repos_js_1.notify)({
        id: `invoice_needed_${booking.id}`,
        type: 'invoice_needed',
        severity: 'action',
        title: `Invoice needed — ${booking.customer.businessName || booking.customer.contactName}`,
        body: `${booking.service.serviceName} completed · ${booking.pricing.finalTotal.toFixed(2)}`,
        link: `/bookings/${booking.id}`,
        relatedId: booking.id,
    });
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications).doc(`needs_completion_${booking.id}`)
        .delete().catch(() => { });
    // Stash the plaintext review token so admin can copy the link.
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(booking.id)
        .set({ reviewTokenPlain: reviewToken }, { merge: true });
}
