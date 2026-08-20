"use strict";
/**
 * Acceptance tests for the scheduling engine.
 *
 * These encode the promises the site makes to a customer. If one of these fails,
 * SUNN CLEAN double-books a crew in the real world. They run without Firestore
 * because the engine is pure functions over plain data.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const luxon_1 = require("luxon");
const scheduling_js_1 = require("./scheduling.js");
const pricing_js_1 = require("./pricing.js");
const defaults_js_1 = require("./defaults.js");
const TZ = 'America/New_York';
const BUF = 60;
const at = (date, hhmm) => luxon_1.DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toMillis();
const sched = (over = {}) => ({ ...(0, defaults_js_1.defaultSettings)(TZ).scheduling, ...over });
function crew(over = {}) {
    return {
        id: 'crewA', name: 'Crew A', color: '#3A90D6', active: true, headcount: 2,
        priority: 1, hours: (0, defaults_js_1.defaultCrewHours)(), blackoutDates: [],
        hourlyCostPerCleaner: 20, notes: '', ...over,
    };
}
function day(crewId, date, blocks) {
    return {
        id: (0, scheduling_js_1.crewDayId)(crewId, date), crewId, date, updatedAt: 0,
        blocks: blocks.map((b, i) => ({
            bookingId: b.id ?? `bk${i}`, start: b.start, end: b.end, label: 'x',
        })),
    };
}
const mapOf = (...days) => new Map(days.map((d) => [d.id, d]));
/* ================================================================== */
/* RULE 1 — the buffer is applied once, not twice                     */
/* ================================================================== */
(0, node_test_1.default)('1. a 60-minute gap after a job is allowed', () => {
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const b = { start: at('2026-09-15', '12:00'), end: at('2026-09-15', '14:00') };
    strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), false);
    strict_1.default.equal((0, scheduling_js_1.conflicts)(b, a, BUF), false, 'must be symmetric');
});
(0, node_test_1.default)('2. a 45-minute gap after a job conflicts', () => {
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const b = { start: at('2026-09-15', '11:45'), end: at('2026-09-15', '13:00') };
    strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), true);
    strict_1.default.equal((0, scheduling_js_1.conflicts)(b, a, BUF), true);
});
(0, node_test_1.default)('3. a 60-minute gap BEFORE a job is allowed (no double-counting)', () => {
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const b = { start: at('2026-09-15', '06:00'), end: at('2026-09-15', '08:00') };
    strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), false);
});
(0, node_test_1.default)('4. a 30-minute gap before a job conflicts', () => {
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const b = { start: at('2026-09-15', '06:00'), end: at('2026-09-15', '08:30') };
    strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), true);
});
(0, node_test_1.default)('5. directly overlapping jobs conflict', () => {
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const b = { start: at('2026-09-15', '10:00'), end: at('2026-09-15', '12:00') };
    strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), true);
});
(0, node_test_1.default)('6. consecutive jobs need exactly ONE buffer width, not two', () => {
    // The bug this catches: padding both sides yields a 2-hour gap requirement.
    const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    for (const [gap, expectConflict] of [[59, true], [60, false], [61, false]]) {
        const b = {
            start: at('2026-09-15', '11:00') + gap * 60_000,
            end: at('2026-09-15', '11:00') + (gap + 120) * 60_000,
        };
        strict_1.default.equal((0, scheduling_js_1.conflicts)(a, b, BUF), expectConflict, `gap=${gap}min`);
    }
});
/* ================================================================== */
/* RULE 3 — always inspect the day before and after                   */
/* ================================================================== */
(0, node_test_1.default)('7. datesToInspect always includes D-1 and D+1', () => {
    const s = at('2026-09-15', '09:00');
    const e = at('2026-09-15', '11:00');
    strict_1.default.deepEqual((0, scheduling_js_1.datesToInspect)(s, e, TZ), ['2026-09-14', '2026-09-15', '2026-09-16']);
});
(0, node_test_1.default)('8. a late job on D-1 constrains an early start on D', () => {
    // The subtle one: the D-1 job does NOT cross midnight, so its block lives only
    // in the D-1 document. Reading only D and D+1 would miss it entirely and let a
    // 00:30 booking through with a 45-minute gap.
    const prev = { start: at('2026-09-14', '22:00'), end: at('2026-09-14', '23:45') };
    const tooSoon = { start: at('2026-09-15', '00:30'), end: at('2026-09-15', '03:00') };
    const farEnough = { start: at('2026-09-15', '00:45'), end: at('2026-09-15', '03:00') };
    const days = mapOf(day('crewA', '2026-09-14', [prev]));
    const inspect = (0, scheduling_js_1.datesToInspect)(tooSoon.start, tooSoon.end, TZ);
    strict_1.default.ok(inspect.includes('2026-09-14'), 'must inspect the previous day');
    const existing = (0, scheduling_js_1.occupancyFor)('crewA', inspect, days);
    strict_1.default.equal(existing.length, 1, 'the previous-day job must be visible');
    strict_1.default.equal((0, scheduling_js_1.fits)(tooSoon, existing, BUF), false, '45-minute gap must be rejected');
    strict_1.default.equal((0, scheduling_js_1.fits)(farEnough, existing, BUF), true, 'exactly 60 minutes is fine');
});
(0, node_test_1.default)('9. a job crossing midnight is indexed on both dates and deduped on read', () => {
    const s = at('2026-09-15', '22:00');
    const e = at('2026-09-16', '02:00');
    strict_1.default.deepEqual((0, scheduling_js_1.datesSpanned)(s, e, TZ), ['2026-09-15', '2026-09-16']);
    const days = mapOf(day('crewA', '2026-09-15', [{ start: s, end: e, id: 'same' }]), day('crewA', '2026-09-16', [{ start: s, end: e, id: 'same' }]));
    const existing = (0, scheduling_js_1.occupancyFor)('crewA', ['2026-09-15', '2026-09-16'], days);
    strict_1.default.equal(existing.length, 1, 'the same booking must not be counted twice');
});
/* ================================================================== */
/* Duration (RULE 2 — crew-independent)                               */
/* ================================================================== */
const service = (over = {}) => ({
    id: 'svc', kind: 'service', name: 'Standard Janitorial', description: '',
    active: true, order: 1, ratePerSqFt: 0.10, minimumCharge: 175,
    productionRateSqFtPerCleanerHour: 3500, ...over,
});
(0, node_test_1.default)('10. duration does not depend on the assigned crew', () => {
    const s = sched({ quotingCrewHeadcount: 3 });
    const a = (0, scheduling_js_1.estimateDuration)({ service: service(), squareFeet: 32000, addOns: [], settings: s });
    const b = (0, scheduling_js_1.estimateDuration)({ service: service(), squareFeet: 32000, addOns: [], settings: s });
    strict_1.default.deepEqual(a, b);
    // 32000 / (3500*3) * 60 = 182.86 ; +20 setup = 202.86 ; round up 15 => 210
    strict_1.default.equal(a.minutes, 210);
});
(0, node_test_1.default)('11. the minimum job length is a floor', () => {
    const s = sched({ quotingCrewHeadcount: 3, minJobMinutes: 120 });
    const r = (0, scheduling_js_1.estimateDuration)({ service: service(), squareFeet: 12000, addOns: [], settings: s });
    // 12000/(3500*3)*60 = 68.6 ; +20 = 88.6 ; round 90 ; floored to 120
    strict_1.default.equal(r.minutes, 120);
});
(0, node_test_1.default)('12. exceeding the maximum returns a manual quote, never a clamped job', () => {
    const s = sched({ quotingCrewHeadcount: 1, maxJobMinutes: 600 });
    const r = (0, scheduling_js_1.estimateDuration)({ service: service(), squareFeet: 500000, addOns: [], settings: s });
    strict_1.default.equal(r.ok, false);
    strict_1.default.equal(r.reason, 'requires_manual_quote');
    strict_1.default.ok(r.minutes > 600, 'the real number is reported, not silently reduced');
});
(0, node_test_1.default)('13. add-on minutes extend the job', () => {
    const s = sched({ quotingCrewHeadcount: 2 });
    const addon = {
        id: 'a1', kind: 'addon', name: 'Restroom', description: '', active: true,
        order: 1, price: 25, minutesPerUnit: 15, allowQuantity: true, unitLabel: 'per restroom',
    };
    const base = (0, scheduling_js_1.estimateDuration)({ service: service(), squareFeet: 10000, addOns: [], settings: s });
    const withAdd = (0, scheduling_js_1.estimateDuration)({
        service: service(), squareFeet: 10000,
        addOns: [{ item: addon, quantity: 4 }], settings: s,
    });
    strict_1.default.ok(withAdd.minutes >= base.minutes + 60, 'four restrooms add at least an hour');
});
/* ================================================================== */
/* Availability                                                        */
/* ================================================================== */
const NOW = at('2026-09-01', '09:00');
function availabilityFor(opts) {
    return (0, scheduling_js_1.computeAvailability)({
        date: opts.date ?? '2026-09-15',
        durationMinutes: opts.duration ?? 120,
        crews: opts.crews,
        crewDays: mapOf(...(opts.days ?? [])),
        settings: sched(opts.settings),
        timezone: TZ,
        blackoutDates: new Set(),
        now: NOW,
    });
}
(0, node_test_1.default)('14. booking a slot removes it and everything within the buffer', () => {
    // Crew opens at 05:00 so both sides of the existing job are reachable.
    const early = crew({ hours: { ...(0, defaults_js_1.defaultCrewHours)(), tue: { enabled: true, start: 5 * 60, end: 19 * 60 } } });
    const existing = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const res = availabilityFor({
        crews: [early],
        days: [day('crewA', '2026-09-15', [existing])],
        duration: 120,
    });
    const labels = res.slots.map((s) => s.startLabel);
    strict_1.default.ok(!labels.includes('09:00'), 'the taken slot is gone');
    strict_1.default.ok(!labels.includes('08:00'), '08:00-10:00 would overlap');
    strict_1.default.ok(!labels.includes('07:30'), 'only a 30-minute gap before');
    strict_1.default.ok(!labels.includes('07:00'), '07:00-09:00 leaves a zero-minute gap');
    strict_1.default.ok(labels.includes('06:00'), '06:00-08:00 leaves exactly 60 minutes');
    strict_1.default.ok(labels.includes('12:00'), 'exactly 60 minutes after is bookable');
    strict_1.default.ok(!labels.includes('11:30'), 'only a 30-minute gap after');
});
(0, node_test_1.default)('15. with two crews the same time is bookable twice, and a third is refused', () => {
    const c1 = crew({ id: 'A', name: 'A', priority: 1 });
    const c2 = crew({ id: 'B', name: 'B', priority: 2 });
    const slot = at('2026-09-15', '09:00');
    const none = (0, scheduling_js_1.candidateCrews)({
        start: slot, durationMinutes: 120, crews: [c1, c2],
        crewDays: mapOf(), settings: sched(), timezone: TZ,
    });
    strict_1.default.equal(none.length, 2, 'both crews free');
    const oneTaken = (0, scheduling_js_1.candidateCrews)({
        start: slot, durationMinutes: 120, crews: [c1, c2],
        crewDays: mapOf(day('A', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }])),
        settings: sched(), timezone: TZ,
    });
    strict_1.default.deepEqual(oneTaken.map((c) => c.id), ['B']);
    const bothTaken = (0, scheduling_js_1.candidateCrews)({
        start: slot, durationMinutes: 120, crews: [c1, c2],
        crewDays: mapOf(day('A', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }]), day('B', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }])),
        settings: sched(), timezone: TZ,
    });
    strict_1.default.equal(bothTaken.length, 0, 'no crew left — the API must return 409');
});
(0, node_test_1.default)('16. deactivating a crew removes its future slots', () => {
    const active = availabilityFor({ crews: [crew()] });
    const inactive = availabilityFor({ crews: [crew({ active: false })] });
    strict_1.default.ok(active.slots.length > 0);
    strict_1.default.equal(inactive.slots.length, 0);
    strict_1.default.equal(inactive.reason, 'no_crews');
});
(0, node_test_1.default)('17. adding a crew with wider hours adds slots', () => {
    const narrow = availabilityFor({ crews: [crew()] });
    const extra = crew({
        id: 'B', name: 'B', priority: 2,
        hours: { ...(0, defaults_js_1.defaultCrewHours)(), tue: { enabled: true, start: 5 * 60, end: 23 * 60 } },
    });
    const wider = availabilityFor({ crews: [crew(), extra] });
    strict_1.default.ok(wider.slots.length > narrow.slots.length, 'more capacity, more slots');
});
(0, node_test_1.default)('18. per-crew hours are respected — a closed day yields nothing', () => {
    const closedTue = crew({
        hours: { ...(0, defaults_js_1.defaultCrewHours)(), tue: { enabled: false, start: 0, end: 0 } },
    });
    const res = availabilityFor({ crews: [closedTue], date: '2026-09-15' });
    strict_1.default.equal(res.slots.length, 0);
    strict_1.default.equal(res.reason, 'closed');
});
(0, node_test_1.default)('19. the service must fit inside working hours; the buffer may spill past', () => {
    const c = crew({ hours: { ...(0, defaults_js_1.defaultCrewHours)(), tue: { enabled: true, start: 8 * 60, end: 12 * 60 } } });
    const res = availabilityFor({ crews: [c], duration: 120 });
    const labels = res.slots.map((s) => s.startLabel);
    strict_1.default.deepEqual(labels, ['08:00', '08:30', '09:00', '09:30', '10:00']);
    strict_1.default.ok(!labels.includes('10:30'), '10:30 + 2h would run past close');
});
(0, node_test_1.default)('20. a per-crew blackout date removes that crew for the day', () => {
    const res = availabilityFor({ crews: [crew({ blackoutDates: ['2026-09-15'] })] });
    strict_1.default.equal(res.slots.length, 0);
});
(0, node_test_1.default)('21. a company blackout date returns no slots', () => {
    const res = (0, scheduling_js_1.computeAvailability)({
        date: '2026-09-15', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
        settings: sched(), timezone: TZ, blackoutDates: new Set(['2026-09-15']), now: NOW,
    });
    strict_1.default.equal(res.reason, 'blackout');
    strict_1.default.equal(res.slots.length, 0);
});
(0, node_test_1.default)('22. minimum lead time is enforced', () => {
    const sameDay = (0, scheduling_js_1.computeAvailability)({
        date: '2026-09-01', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
        settings: sched({ minLeadTimeHours: 24 }), timezone: TZ,
        blackoutDates: new Set(), now: NOW,
    });
    strict_1.default.equal(sameDay.slots.length, 0, 'nothing within 24h of now');
});
(0, node_test_1.default)('23. the booking horizon is enforced', () => {
    const res = (0, scheduling_js_1.computeAvailability)({
        date: '2027-06-01', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
        settings: sched({ maxHorizonDays: 60 }), timezone: TZ,
        blackoutDates: new Set(), now: NOW,
    });
    strict_1.default.equal(res.reason, 'out_of_range');
});
(0, node_test_1.default)('24. changing the buffer widens gaps without touching existing bookings', () => {
    const existing = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
    const days = [day('crewA', '2026-09-15', [existing])];
    const at60 = availabilityFor({ crews: [crew()], days, settings: { travelBufferMinutes: 60 } });
    const at90 = availabilityFor({ crews: [crew()], days, settings: { travelBufferMinutes: 90 } });
    strict_1.default.ok(at60.slots.map((s) => s.startLabel).includes('12:00'));
    strict_1.default.ok(!at90.slots.map((s) => s.startLabel).includes('12:00'), '90-min buffer pushes it out');
    strict_1.default.ok(at90.slots.map((s) => s.startLabel).includes('12:30'));
});
(0, node_test_1.default)('25. a completed job still holds its slot (blocks are status-independent)', () => {
    // occupancyFor reads crew-day blocks and knows nothing about booking status,
    // which is exactly the point: marking a job complete at 14:00 while the crew
    // is still on site must not re-open 13:00-16:00 to a new customer.
    const existing = { start: at('2026-09-15', '13:00'), end: at('2026-09-15', '16:00') };
    const res = availabilityFor({
        crews: [crew()], days: [day('crewA', '2026-09-15', [existing])], duration: 120,
    });
    strict_1.default.ok(!res.slots.map((s) => s.startLabel).includes('13:00'));
});
(0, node_test_1.default)('26. cancelling frees the slot immediately', () => {
    const before = availabilityFor({
        crews: [crew()],
        days: [day('crewA', '2026-09-15', [{ start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') }])],
    });
    const after = availabilityFor({ crews: [crew()], days: [day('crewA', '2026-09-15', [])] });
    strict_1.default.ok(!before.slots.map((s) => s.startLabel).includes('09:00'));
    strict_1.default.ok(after.slots.map((s) => s.startLabel).includes('09:00'));
});
(0, node_test_1.default)('27. rescheduling excludes the booking from its own occupancy', () => {
    const start = at('2026-09-15', '09:00');
    const days = mapOf(day('crewA', '2026-09-15', [{ start, end: start + 7.2e6, id: 'me' }]));
    const nudged = start + 30 * 60_000;
    const blocked = (0, scheduling_js_1.candidateCrews)({
        start: nudged, durationMinutes: 120, crews: [crew()],
        crewDays: days, settings: sched(), timezone: TZ,
    });
    strict_1.default.equal(blocked.length, 0, 'without the exclusion it collides with itself');
    const allowed = (0, scheduling_js_1.candidateCrews)({
        start: nudged, durationMinutes: 120, crews: [crew()],
        crewDays: days, settings: sched(), timezone: TZ, excludeBookingId: 'me',
    });
    strict_1.default.equal(allowed.length, 1, 'with the exclusion the move is legal');
});
/* ================================================================== */
/* DST — the twice-a-year bug                                          */
/* ================================================================== */
(0, node_test_1.default)('28. spring-forward produces no duplicated or missing slots', () => {
    // 2027-03-14: US clocks jump 02:00 -> 03:00.
    const c = crew({ hours: { ...(0, defaults_js_1.defaultCrewHours)(), sun: { enabled: true, start: 0, end: 8 * 60 } } });
    const res = (0, scheduling_js_1.computeAvailability)({
        date: '2027-03-14', durationMinutes: 120, crews: [c], crewDays: mapOf(),
        settings: sched({ minLeadTimeHours: 0, maxHorizonDays: 400, slotGranularityMinutes: 60 }),
        timezone: TZ, blackoutDates: new Set(), now: at('2027-03-01', '09:00'),
    });
    const labels = res.slots.map((s) => s.startLabel);
    strict_1.default.equal(new Set(labels).size, labels.length, 'no duplicated wall-clock times');
    strict_1.default.ok(!labels.includes('02:00'), '02:00 does not exist on this date');
});
(0, node_test_1.default)('29. fall-back does not create a duplicate hour', () => {
    // 2026-11-01: US clocks fall 02:00 -> 01:00.
    const c = crew({ hours: { ...(0, defaults_js_1.defaultCrewHours)(), sun: { enabled: true, start: 0, end: 8 * 60 } } });
    const res = (0, scheduling_js_1.computeAvailability)({
        date: '2026-11-01', durationMinutes: 120, crews: [c], crewDays: mapOf(),
        settings: sched({ minLeadTimeHours: 0, maxHorizonDays: 400, slotGranularityMinutes: 60 }),
        timezone: TZ, blackoutDates: new Set(), now: at('2026-10-01', '09:00'),
    });
    const labels = res.slots.map((s) => s.startLabel);
    strict_1.default.equal(new Set(labels).size, labels.length, 'each wall-clock start appears once');
});
(0, node_test_1.default)('30. weekdayOf maps correctly across the week', () => {
    strict_1.default.equal((0, scheduling_js_1.weekdayOf)('2026-09-13', TZ), 'sun');
    strict_1.default.equal((0, scheduling_js_1.weekdayOf)('2026-09-14', TZ), 'mon');
    strict_1.default.equal((0, scheduling_js_1.weekdayOf)('2026-09-15', TZ), 'tue');
    strict_1.default.equal((0, scheduling_js_1.weekdayOf)('2026-09-19', TZ), 'sat');
});
/* ================================================================== */
/* Pricing                                                             */
/* ================================================================== */
const invoicing = (over = {}) => ({ ...(0, defaults_js_1.defaultSettings)(TZ).invoicing, ...over });
const propType = (modifier, name = 'Office') => ({ id: 'p1', name, modifier, active: true, order: 1 });
function quote(over = {}) {
    return (0, pricing_js_1.computeQuote)({
        service: service(),
        propertyType: propType(1),
        squareFeet: 32000,
        floors: 1,
        hasElevator: true,
        addOns: [],
        surcharges: [],
        scheduling: sched({ quotingCrewHeadcount: 3 }),
        invoicing: invoicing(),
        timezone: TZ,
        ...over,
    });
}
(0, node_test_1.default)('31. the minimum charge is applied AFTER modifiers, not before', () => {
    // 1000 sq ft x $0.10 = $100 raw; x0.85 warehouse = $85; floor is $175.
    // Applying the floor first would give 175 x 0.85 = $148.75 — below the floor.
    const r = quote({
        squareFeet: 1000,
        propertyType: propType(0.85, 'Warehouse'),
    });
    strict_1.default.equal(r.subtotal, 175, 'never prices below the stated minimum');
});
(0, node_test_1.default)('32. modifiers scale the base when above the minimum', () => {
    const plain = quote({ squareFeet: 32000, propertyType: propType(1) });
    const medical = quote({ squareFeet: 32000, propertyType: propType(1.25, 'Medical') });
    strict_1.default.equal(plain.subtotal, 3200);
    strict_1.default.equal(medical.subtotal, 4000);
});
(0, node_test_1.default)('33. line items sum exactly to the subtotal', () => {
    const addon = {
        id: 'a1', kind: 'addon', name: 'Restroom', description: '', active: true,
        order: 1, price: 25, minutesPerUnit: 15, allowQuantity: true,
    };
    const sur = {
        id: 's1', name: 'After hours', description: '', type: 'percent', value: 0.15,
        trigger: 'after_hours', beforeMinute: 420, afterMinute: 1080, active: true, order: 1,
    };
    const r = quote({
        addOns: [{ item: addon, quantity: 4 }],
        surcharges: [sur],
        startAt: at('2026-09-15', '19:00'),
    });
    const sum = (0, pricing_js_1.round2)(r.lineItems.reduce((s, l) => s + l.amount, 0));
    strict_1.default.equal(sum, r.subtotal, 'the breakdown a customer reads must add up');
    // 3200 base + 100 add-ons = 3300; +15% = 495 => 3795
    strict_1.default.equal(r.subtotal, 3795);
});
(0, node_test_1.default)('34. tax is computed on the subtotal including adjustments', () => {
    const r = quote({
        invoicing: invoicing({ taxRate: 0.10 }),
        extraLineItems: [{ key: 'adj', label: 'Extra scope', type: 'adjustment', amount: 400 }],
    });
    strict_1.default.equal(r.subtotal, 3600);
    strict_1.default.equal(r.taxAmount, 360, 'the adjustment is taxed, not bolted on after tax');
    strict_1.default.equal(r.total, 3960);
});
(0, node_test_1.default)('35. retotal matches computeQuote for the same line items', () => {
    const r = quote({ invoicing: invoicing({ taxRate: 0.08875 }) });
    const again = (0, pricing_js_1.retotal)(r.lineItems, 0.08875);
    strict_1.default.equal(again.subtotal, r.subtotal);
    strict_1.default.equal(again.total, r.total);
});
(0, node_test_1.default)('36. an inactive surcharge never applies', () => {
    const sur = {
        id: 's1', name: 'Weekend', description: '', type: 'percent', value: 0.10,
        trigger: 'weekend', active: false, order: 1,
    };
    const r = quote({ surcharges: [sur], startAt: at('2026-09-19', '09:00') });
    strict_1.default.equal(r.subtotal, 3200, 'switched off means zero effect');
});
(0, node_test_1.default)('37. the no-elevator surcharge needs both conditions', () => {
    const sur = {
        id: 's1', name: 'No elevator', description: '', type: 'flat', value: 50,
        trigger: 'no_elevator', minFloors: 2, active: true, order: 1,
    };
    strict_1.default.equal(quote({ surcharges: [sur], floors: 1, hasElevator: false }).subtotal, 3200);
    strict_1.default.equal(quote({ surcharges: [sur], floors: 3, hasElevator: true }).subtotal, 3200);
    strict_1.default.equal(quote({ surcharges: [sur], floors: 3, hasElevator: false }).subtotal, 3250);
});
(0, node_test_1.default)('38. an empty catalog fails cleanly instead of inventing a price', () => {
    const r = (0, pricing_js_1.computeQuote)({
        service: { ...service(), active: false },
        propertyType: null, squareFeet: 1000, floors: 1, hasElevator: true,
        addOns: [], surcharges: [], scheduling: sched(), invoicing: invoicing(), timezone: TZ,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.equal(r.reason, 'invalid_service');
    strict_1.default.equal(r.total, 0);
});
(0, node_test_1.default)('39. a job needing a manual quote reports ok:false but still itemises', () => {
    const r = quote({ squareFeet: 500000, scheduling: sched({ quotingCrewHeadcount: 1 }) });
    strict_1.default.equal(r.ok, false);
    strict_1.default.equal(r.reason, 'requires_manual_quote');
    strict_1.default.ok(r.subtotal > 0, 'admin can still see what it would have cost');
});
(0, node_test_1.default)('40. payout is hours x headcount x rate', () => {
    strict_1.default.equal((0, pricing_js_1.computePayout)(3.8333, 3, 24), 276);
    strict_1.default.equal((0, pricing_js_1.computePayout)(0, 3, 24), 0);
    strict_1.default.equal((0, pricing_js_1.computePayout)(5, 0, 24), 0);
});
