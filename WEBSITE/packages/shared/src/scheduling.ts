/**
 * SUNN CLEAN — scheduling engine.
 *
 * This file is the reason the site can promise "no double booking". Three rules,
 * and each one has a trap that a naive implementation falls into.
 *
 * RULE 1 — the travel buffer is applied ONCE between two jobs, not twice.
 *   The obvious implementation pads each job with 60 min before AND after, then
 *   checks overlap. That produces a TWO-hour gap between consecutive jobs and
 *   silently costs ~1/3 of capacity. The correct test is symmetric:
 *
 *       conflict(A, B)  ⇔  A.start < B.end + BUFFER  AND  B.start < A.end + BUFFER
 *
 * RULE 2 — duration must not depend on which crew is assigned.
 *   Availability returns one end time per slot but crew assignment happens later,
 *   so a crew-dependent duration would quote 08:00–09:45 and book 08:00–11:00.
 *   Duration is computed from settings.quotingCrewHeadcount for everyone.
 *
 * RULE 3 — always read the day before and the day after.
 *   A job on D-1 running 21:00–23:00 does not cross midnight, so its block lives
 *   only in the D-1 index document. A 00:30 booking on D that reads only D and
 *   D+1 sees an empty calendar and books, leaving a 90-minute buffer violation.
 */

import { DateTime } from 'luxon';
import type {
  AvailabilityResult, AvailabilitySlot, CatalogItem, Crew, CrewDay, CrewDayBlock,
  DayHours, ISODate, Millis, SchedulingSettings, Weekday,
} from './types.js';
import { WEEKDAYS } from './types.js';

/* ------------------------------------------------------------------ */
/* Duration                                                            */
/* ------------------------------------------------------------------ */

export interface DurationInput {
  service: CatalogItem;
  squareFeet: number;
  addOns: { item: CatalogItem; quantity: number }[];
  settings: SchedulingSettings;
}

export interface DurationResult {
  ok: boolean;
  minutes: number;
  reason?: 'requires_manual_quote' | 'invalid_service';
  breakdown: { cleaning: number; setup: number; addOns: number; raw: number };
}

export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * Estimate on-site minutes. Crew-independent by design (RULE 2).
 * Exceeding maxJobMinutes returns ok:false rather than clamping down — a
 * 14-hour job silently scheduled as 10 hours is worse than no slot at all.
 */
export function estimateDuration(input: DurationInput): DurationResult {
  const { service, squareFeet, addOns, settings } = input;
  const prod = service.productionRateSqFtPerCleanerHour ?? 0;
  const empty = { cleaning: 0, setup: 0, addOns: 0, raw: 0 };

  if (service.kind !== 'service' || prod <= 0 || squareFeet <= 0) {
    return { ok: false, minutes: 0, reason: 'invalid_service', breakdown: empty };
  }

  const headcount = Math.max(1, settings.quotingCrewHeadcount);
  const cleaning = (squareFeet / (prod * headcount)) * 60;
  const setup = settings.setupMinutes;
  const addOnMinutes = addOns.reduce(
    (sum, a) => sum + (a.item.minutesPerUnit ?? 0) * Math.max(0, a.quantity), 0);

  const raw = cleaning + setup + addOnMinutes;
  const breakdown = { cleaning, setup, addOns: addOnMinutes, raw };

  const rounded = roundUpTo(raw, 15);
  const minutes = Math.max(rounded, settings.minJobMinutes);

  if (minutes > settings.maxJobMinutes) {
    return { ok: false, minutes, reason: 'requires_manual_quote', breakdown };
  }
  return { ok: true, minutes, breakdown };
}

/* ------------------------------------------------------------------ */
/* Conflict detection                                                  */
/* ------------------------------------------------------------------ */

export interface Interval { start: Millis; end: Millis }

/**
 * RULE 1. Symmetric, and produces exactly one buffer-width gap between two
 * consecutive jobs regardless of which comes first.
 */
export function conflicts(a: Interval, b: Interval, bufferMinutes: number): boolean {
  const buf = bufferMinutes * 60_000;
  return a.start < b.end + buf && b.start < a.end + buf;
}

/** True when `candidate` can be placed among `existing` without violating RULE 1. */
export function fits(
  candidate: Interval,
  existing: Interval[],
  bufferMinutes: number,
): boolean {
  return !existing.some((e) => conflicts(candidate, e, bufferMinutes));
}

/* ------------------------------------------------------------------ */
/* Business-local time helpers                                         */
/* ------------------------------------------------------------------ */

export function isoDate(ms: Millis, tz: string): ISODate {
  return DateTime.fromMillis(ms, { zone: tz }).toFormat('yyyy-MM-dd');
}

export function weekdayOf(date: ISODate, tz: string): Weekday {
  const dt = DateTime.fromISO(date, { zone: tz });
  // luxon weekday: 1 = Monday … 7 = Sunday. WEEKDAYS is sun-first.
  return WEEKDAYS[dt.weekday % 7];
}

/** Local midnight of `date`, as UTC millis. DST-safe. */
export function startOfDay(date: ISODate, tz: string): Millis {
  return DateTime.fromISO(date, { zone: tz }).startOf('day').toMillis();
}

/**
 * Add `minutes` from local midnight. Uses a real date arithmetic path rather
 * than `midnight + minutes*60000` so a DST transition inside the window does
 * not shift the wall-clock time.
 */
export function localMinuteToMillis(date: ISODate, tz: string, minute: number): Millis {
  return DateTime.fromISO(date, { zone: tz }).startOf('day')
    .plus({ minutes: minute }).toMillis();
}

export function labelOf(ms: Millis, tz: string): string {
  return DateTime.fromMillis(ms, { zone: tz }).toFormat('HH:mm');
}

/** Every business-local date the interval touches — used to index crew-days. */
export function datesSpanned(start: Millis, end: Millis, tz: string): ISODate[] {
  const out: ISODate[] = [];
  let cursor = DateTime.fromMillis(start, { zone: tz }).startOf('day');
  const last = DateTime.fromMillis(end, { zone: tz }).startOf('day');
  while (cursor <= last) {
    out.push(cursor.toFormat('yyyy-MM-dd'));
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

/**
 * RULE 3. The crew-day documents that must be read to validate an interval:
 * always at minimum the day before, the day itself, and the day after.
 */
export function datesToInspect(start: Millis, end: Millis, tz: string): ISODate[] {
  const span = datesSpanned(start, end, tz);
  const first = DateTime.fromISO(span[0], { zone: tz }).minus({ days: 1 }).toFormat('yyyy-MM-dd');
  const last = DateTime.fromISO(span[span.length - 1], { zone: tz }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
  return [first, ...span, last];
}

export function crewDayId(crewId: string, date: ISODate): string {
  return `${crewId}_${date}`;
}

/* ------------------------------------------------------------------ */
/* Crew working window                                                 */
/* ------------------------------------------------------------------ */

export function crewHoursFor(crew: Crew, date: ISODate, tz: string): DayHours | null {
  if (!crew.active) return null;
  if (crew.blackoutDates?.includes(date)) return null;
  const wd = weekdayOf(date, tz);
  const h = crew.hours?.[wd];
  if (!h || !h.enabled) return null;
  if (h.end <= h.start) return null;
  return h;
}

export interface CrewWindow { crew: Crew; open: Millis; close: Millis }

export function crewWindow(crew: Crew, date: ISODate, tz: string): CrewWindow | null {
  const h = crewHoursFor(crew, date, tz);
  if (!h) return null;
  return {
    crew,
    open: localMinuteToMillis(date, tz, h.start),
    close: localMinuteToMillis(date, tz, h.end), // may exceed 1440 → next day
  };
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

export interface AvailabilityInput {
  date: ISODate;
  durationMinutes: number;
  crews: Crew[];
  /** All crew-day docs for the inspected window, keyed by `${crewId}_${date}` */
  crewDays: Map<string, CrewDay>;
  settings: SchedulingSettings;
  timezone: string;
  blackoutDates: Set<ISODate>;
  /** Injected so tests are deterministic. */
  now: Millis;
  /** Exclude this booking's own blocks — used when rescheduling. */
  excludeBookingId?: string;
}

/**
 * Collect every existing service interval for `crew` across the days that could
 * interact with `date`. Reads only crew-day index docs (never the bookings
 * collection) so availability and the booking transaction share one source of
 * truth and cannot drift.
 */
export function occupancyFor(
  crewId: string,
  dates: ISODate[],
  crewDays: Map<string, CrewDay>,
  excludeBookingId?: string,
): Interval[] {
  const seen = new Set<string>();
  const out: Interval[] = [];
  for (const d of dates) {
    const doc = crewDays.get(crewDayId(crewId, d));
    if (!doc) continue;
    for (const b of doc.blocks ?? []) {
      if (excludeBookingId && b.bookingId === excludeBookingId) continue;
      if (seen.has(b.bookingId)) continue; // a job spanning midnight appears twice
      seen.add(b.bookingId);
      out.push({ start: b.start, end: b.end });
    }
  }
  return out;
}

export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  const {
    date, durationMinutes, crews, crewDays, settings, timezone,
    blackoutDates, now, excludeBookingId,
  } = input;

  const base: AvailabilityResult = {
    date, timezone, durationMinutes, slots: [],
  };

  if (durationMinutes <= 0) return { ...base, reason: 'requires_manual_quote' };
  if (blackoutDates.has(date)) return { ...base, reason: 'blackout' };

  // Range check in business-local days
  const today = DateTime.fromMillis(now, { zone: timezone }).startOf('day');
  const target = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const horizonEnd = today.plus({ days: settings.maxHorizonDays });
  if (target < today || target > horizonEnd) return { ...base, reason: 'out_of_range' };

  const earliestStart = now + settings.minLeadTimeHours * 3_600_000;
  const durMs = durationMinutes * 60_000;
  const grain = Math.max(5, settings.slotGranularityMinutes);

  const activeCrews = crews.filter((c) => c.active);
  if (activeCrews.length === 0) return { ...base, reason: 'no_crews' };

  const startsSet = new Map<Millis, AvailabilitySlot>();
  /**
   * On a fall-back DST night the wall clock repeats an hour, so two distinct
   * instants both render as "01:00". Offering the customer two identical-looking
   * buttons is a bug, so the first (earlier) instant wins and the duplicate is
   * dropped. Spring-forward needs no handling — the skipped hour simply never
   * appears because no instant maps to it.
   */
  const seenLabels = new Set<string>();
  let anyOpen = false;

  for (const crew of activeCrews) {
    const win = crewWindow(crew, date, timezone);
    if (!win) continue;
    anyOpen = true;

    // Occupancy for the days this crew's candidate jobs could touch.
    const probe = datesToInspect(win.open, win.close + durMs, timezone);
    const existing = occupancyFor(crew.id, probe, crewDays, excludeBookingId);

    // Walk candidate starts on the grid. The SERVICE must fit inside the
    // window; the travel buffer is allowed to extend beyond it.
    for (let t = win.open; t + durMs <= win.close; t += grain * 60_000) {
      if (t < earliestStart) continue;
      const candidate = { start: t, end: t + durMs };
      if (!fits(candidate, existing, settings.travelBufferMinutes)) continue;
      if (startsSet.has(t)) continue;
      const startLabel = labelOf(t, timezone);
      if (seenLabels.has(startLabel)) continue; // DST fall-back duplicate
      seenLabels.add(startLabel);
      startsSet.set(t, {
        start: t,
        end: t + durMs,
        startLabel,
        endLabel: labelOf(t + durMs, timezone),
      });
    }
  }

  if (!anyOpen) return { ...base, reason: 'closed' };

  const slots = [...startsSet.values()].sort((a, b) => a.start - b.start);
  return { ...base, slots };
}

/* ------------------------------------------------------------------ */
/* Crew assignment                                                     */
/* ------------------------------------------------------------------ */

export interface AssignInput {
  start: Millis;
  durationMinutes: number;
  crews: Crew[];
  crewDays: Map<string, CrewDay>;
  settings: SchedulingSettings;
  timezone: string;
  excludeBookingId?: string;
}

/**
 * Ordered list of crews that could take this exact slot, best first.
 * The booking transaction walks this list, re-validating inside the
 * transaction, so a stale read here can never cause a double booking.
 */
export function candidateCrews(input: AssignInput): Crew[] {
  const { start, durationMinutes, crews, crewDays, settings, timezone, excludeBookingId } = input;
  const end = start + durationMinutes * 60_000;
  const date = isoDate(start, timezone);

  return crews
    .filter((c) => c.active)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .filter((crew) => {
      const win = crewWindow(crew, date, timezone);
      if (!win) return false;
      if (start < win.open || end > win.close) return false;
      const probe = datesToInspect(start, end, timezone);
      const existing = occupancyFor(crew.id, probe, crewDays, excludeBookingId);
      return fits({ start, end }, existing, settings.travelBufferMinutes);
    });
}

/** Blocks to write, one per business-local date the service window touches. */
export function blocksForBooking(
  bookingId: string,
  label: string,
  start: Millis,
  end: Millis,
  tz: string,
): { date: ISODate; block: CrewDayBlock }[] {
  return datesSpanned(start, end, tz).map((date) => ({
    date,
    block: { bookingId, start, end, label },
  }));
}
