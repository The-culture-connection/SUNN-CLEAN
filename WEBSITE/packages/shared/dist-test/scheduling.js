"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundUpTo = roundUpTo;
exports.estimateDuration = estimateDuration;
exports.conflicts = conflicts;
exports.fits = fits;
exports.isoDate = isoDate;
exports.weekdayOf = weekdayOf;
exports.startOfDay = startOfDay;
exports.localMinuteToMillis = localMinuteToMillis;
exports.labelOf = labelOf;
exports.datesSpanned = datesSpanned;
exports.datesToInspect = datesToInspect;
exports.crewDayId = crewDayId;
exports.crewHoursFor = crewHoursFor;
exports.crewWindow = crewWindow;
exports.occupancyFor = occupancyFor;
exports.computeAvailability = computeAvailability;
exports.candidateCrews = candidateCrews;
exports.blocksForBooking = blocksForBooking;
const luxon_1 = require("luxon");
const types_js_1 = require("./types.js");
function roundUpTo(value, step) {
    return Math.ceil(value / step) * step;
}
/**
 * Estimate on-site minutes. Crew-independent by design (RULE 2).
 * Exceeding maxJobMinutes returns ok:false rather than clamping down — a
 * 14-hour job silently scheduled as 10 hours is worse than no slot at all.
 */
function estimateDuration(input) {
    const { service, squareFeet, addOns, settings } = input;
    const prod = service.productionRateSqFtPerCleanerHour ?? 0;
    const empty = { cleaning: 0, setup: 0, addOns: 0, raw: 0 };
    if (service.kind !== 'service' || prod <= 0 || squareFeet <= 0) {
        return { ok: false, minutes: 0, reason: 'invalid_service', breakdown: empty };
    }
    const headcount = Math.max(1, settings.quotingCrewHeadcount);
    const cleaning = (squareFeet / (prod * headcount)) * 60;
    const setup = settings.setupMinutes;
    const addOnMinutes = addOns.reduce((sum, a) => sum + (a.item.minutesPerUnit ?? 0) * Math.max(0, a.quantity), 0);
    const raw = cleaning + setup + addOnMinutes;
    const breakdown = { cleaning, setup, addOns: addOnMinutes, raw };
    const rounded = roundUpTo(raw, 15);
    const minutes = Math.max(rounded, settings.minJobMinutes);
    if (minutes > settings.maxJobMinutes) {
        return { ok: false, minutes, reason: 'requires_manual_quote', breakdown };
    }
    return { ok: true, minutes, breakdown };
}
/**
 * RULE 1. Symmetric, and produces exactly one buffer-width gap between two
 * consecutive jobs regardless of which comes first.
 */
function conflicts(a, b, bufferMinutes) {
    const buf = bufferMinutes * 60_000;
    return a.start < b.end + buf && b.start < a.end + buf;
}
/** True when `candidate` can be placed among `existing` without violating RULE 1. */
function fits(candidate, existing, bufferMinutes) {
    return !existing.some((e) => conflicts(candidate, e, bufferMinutes));
}
/* ------------------------------------------------------------------ */
/* Business-local time helpers                                         */
/* ------------------------------------------------------------------ */
function isoDate(ms, tz) {
    return luxon_1.DateTime.fromMillis(ms, { zone: tz }).toFormat('yyyy-MM-dd');
}
function weekdayOf(date, tz) {
    const dt = luxon_1.DateTime.fromISO(date, { zone: tz });
    // luxon weekday: 1 = Monday … 7 = Sunday. WEEKDAYS is sun-first.
    return types_js_1.WEEKDAYS[dt.weekday % 7];
}
/** Local midnight of `date`, as UTC millis. DST-safe. */
function startOfDay(date, tz) {
    return luxon_1.DateTime.fromISO(date, { zone: tz }).startOf('day').toMillis();
}
/**
 * Add `minutes` from local midnight. Uses a real date arithmetic path rather
 * than `midnight + minutes*60000` so a DST transition inside the window does
 * not shift the wall-clock time.
 */
function localMinuteToMillis(date, tz, minute) {
    return luxon_1.DateTime.fromISO(date, { zone: tz }).startOf('day')
        .plus({ minutes: minute }).toMillis();
}
function labelOf(ms, tz) {
    return luxon_1.DateTime.fromMillis(ms, { zone: tz }).toFormat('HH:mm');
}
/** Every business-local date the interval touches — used to index crew-days. */
function datesSpanned(start, end, tz) {
    const out = [];
    let cursor = luxon_1.DateTime.fromMillis(start, { zone: tz }).startOf('day');
    const last = luxon_1.DateTime.fromMillis(end, { zone: tz }).startOf('day');
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
function datesToInspect(start, end, tz) {
    const span = datesSpanned(start, end, tz);
    const first = luxon_1.DateTime.fromISO(span[0], { zone: tz }).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const last = luxon_1.DateTime.fromISO(span[span.length - 1], { zone: tz }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
    return [first, ...span, last];
}
function crewDayId(crewId, date) {
    return `${crewId}_${date}`;
}
/* ------------------------------------------------------------------ */
/* Crew working window                                                 */
/* ------------------------------------------------------------------ */
function crewHoursFor(crew, date, tz) {
    if (!crew.active)
        return null;
    if (crew.blackoutDates?.includes(date))
        return null;
    const wd = weekdayOf(date, tz);
    const h = crew.hours?.[wd];
    if (!h || !h.enabled)
        return null;
    if (h.end <= h.start)
        return null;
    return h;
}
function crewWindow(crew, date, tz) {
    const h = crewHoursFor(crew, date, tz);
    if (!h)
        return null;
    return {
        crew,
        open: localMinuteToMillis(date, tz, h.start),
        close: localMinuteToMillis(date, tz, h.end), // may exceed 1440 → next day
    };
}
/**
 * Collect every existing service interval for `crew` across the days that could
 * interact with `date`. Reads only crew-day index docs (never the bookings
 * collection) so availability and the booking transaction share one source of
 * truth and cannot drift.
 */
function occupancyFor(crewId, dates, crewDays, excludeBookingId) {
    const seen = new Set();
    const out = [];
    for (const d of dates) {
        const doc = crewDays.get(crewDayId(crewId, d));
        if (!doc)
            continue;
        for (const b of doc.blocks ?? []) {
            if (excludeBookingId && b.bookingId === excludeBookingId)
                continue;
            if (seen.has(b.bookingId))
                continue; // a job spanning midnight appears twice
            seen.add(b.bookingId);
            out.push({ start: b.start, end: b.end });
        }
    }
    return out;
}
function computeAvailability(input) {
    const { date, durationMinutes, crews, crewDays, settings, timezone, blackoutDates, now, excludeBookingId, } = input;
    const base = {
        date, timezone, durationMinutes, slots: [],
    };
    if (durationMinutes <= 0)
        return { ...base, reason: 'requires_manual_quote' };
    if (blackoutDates.has(date))
        return { ...base, reason: 'blackout' };
    // Range check in business-local days
    const today = luxon_1.DateTime.fromMillis(now, { zone: timezone }).startOf('day');
    const target = luxon_1.DateTime.fromISO(date, { zone: timezone }).startOf('day');
    const horizonEnd = today.plus({ days: settings.maxHorizonDays });
    if (target < today || target > horizonEnd)
        return { ...base, reason: 'out_of_range' };
    const earliestStart = now + settings.minLeadTimeHours * 3_600_000;
    const durMs = durationMinutes * 60_000;
    const grain = Math.max(5, settings.slotGranularityMinutes);
    const activeCrews = crews.filter((c) => c.active);
    if (activeCrews.length === 0)
        return { ...base, reason: 'no_crews' };
    const startsSet = new Map();
    /**
     * On a fall-back DST night the wall clock repeats an hour, so two distinct
     * instants both render as "01:00". Offering the customer two identical-looking
     * buttons is a bug, so the first (earlier) instant wins and the duplicate is
     * dropped. Spring-forward needs no handling — the skipped hour simply never
     * appears because no instant maps to it.
     */
    const seenLabels = new Set();
    let anyOpen = false;
    for (const crew of activeCrews) {
        const win = crewWindow(crew, date, timezone);
        if (!win)
            continue;
        anyOpen = true;
        // Occupancy for the days this crew's candidate jobs could touch.
        const probe = datesToInspect(win.open, win.close + durMs, timezone);
        const existing = occupancyFor(crew.id, probe, crewDays, excludeBookingId);
        // Walk candidate starts on the grid. The SERVICE must fit inside the
        // window; the travel buffer is allowed to extend beyond it.
        for (let t = win.open; t + durMs <= win.close; t += grain * 60_000) {
            if (t < earliestStart)
                continue;
            const candidate = { start: t, end: t + durMs };
            if (!fits(candidate, existing, settings.travelBufferMinutes))
                continue;
            if (startsSet.has(t))
                continue;
            const startLabel = labelOf(t, timezone);
            if (seenLabels.has(startLabel))
                continue; // DST fall-back duplicate
            seenLabels.add(startLabel);
            startsSet.set(t, {
                start: t,
                end: t + durMs,
                startLabel,
                endLabel: labelOf(t + durMs, timezone),
            });
        }
    }
    if (!anyOpen)
        return { ...base, reason: 'closed' };
    const slots = [...startsSet.values()].sort((a, b) => a.start - b.start);
    return { ...base, slots };
}
/**
 * Ordered list of crews that could take this exact slot, best first.
 * The booking transaction walks this list, re-validating inside the
 * transaction, so a stale read here can never cause a double booking.
 */
function candidateCrews(input) {
    const { start, durationMinutes, crews, crewDays, settings, timezone, excludeBookingId } = input;
    const end = start + durationMinutes * 60_000;
    const date = isoDate(start, timezone);
    return crews
        .filter((c) => c.active)
        .slice()
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
        .filter((crew) => {
        const win = crewWindow(crew, date, timezone);
        if (!win)
            return false;
        if (start < win.open || end > win.close)
            return false;
        const probe = datesToInspect(start, end, timezone);
        const existing = occupancyFor(crew.id, probe, crewDays, excludeBookingId);
        return fits({ start, end }, existing, settings.travelBufferMinutes);
    });
}
/** Blocks to write, one per business-local date the service window touches. */
function blocksForBooking(bookingId, label, start, end, tz) {
    return datesSpanned(start, end, tz).map((date) => ({
        date,
        block: { bookingId, start, end, label },
    }));
}
