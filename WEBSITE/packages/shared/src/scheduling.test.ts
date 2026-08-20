/**
 * Acceptance tests for the scheduling engine.
 *
 * These encode the promises the site makes to a customer. If one of these fails,
 * SUNN CLEAN double-books a crew in the real world. They run without Firestore
 * because the engine is pure functions over plain data.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';

import {
  computeAvailability, conflicts, candidateCrews, crewDayId, datesSpanned,
  datesToInspect, estimateDuration, fits, occupancyFor, weekdayOf,
} from './scheduling.js';
import { computeQuote, computePayout, retotal, round2 } from './pricing.js';
import { defaultCrewHours, defaultSettings } from './defaults.js';
import type {
  CatalogItem, Crew, CrewDay, InvoicingSettings, PropertyType,
  SchedulingSettings, Surcharge,
} from './types.js';

const TZ = 'America/New_York';
const BUF = 60;

const at = (date: string, hhmm: string): number =>
  DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toMillis();

const sched = (over: Partial<SchedulingSettings> = {}): SchedulingSettings =>
  ({ ...defaultSettings(TZ).scheduling, ...over });

function crew(over: Partial<Crew> = {}): Crew {
  return {
    id: 'crewA', name: 'Crew A', color: '#3A90D6', active: true, headcount: 2,
    priority: 1, hours: defaultCrewHours(), blackoutDates: [],
    hourlyCostPerCleaner: 20, notes: '', ...over,
  };
}

function day(crewId: string, date: string, blocks: { start: number; end: number; id?: string }[]): CrewDay {
  return {
    id: crewDayId(crewId, date), crewId, date, updatedAt: 0,
    blocks: blocks.map((b, i) => ({
      bookingId: b.id ?? `bk${i}`, start: b.start, end: b.end, label: 'x',
    })),
  };
}

const mapOf = (...days: CrewDay[]) => new Map(days.map((d) => [d.id, d]));

/* ================================================================== */
/* RULE 1 — the buffer is applied once, not twice                     */
/* ================================================================== */

test('1. a 60-minute gap after a job is allowed', () => {
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const b = { start: at('2026-09-15', '12:00'), end: at('2026-09-15', '14:00') };
  assert.equal(conflicts(a, b, BUF), false);
  assert.equal(conflicts(b, a, BUF), false, 'must be symmetric');
});

test('2. a 45-minute gap after a job conflicts', () => {
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const b = { start: at('2026-09-15', '11:45'), end: at('2026-09-15', '13:00') };
  assert.equal(conflicts(a, b, BUF), true);
  assert.equal(conflicts(b, a, BUF), true);
});

test('3. a 60-minute gap BEFORE a job is allowed (no double-counting)', () => {
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const b = { start: at('2026-09-15', '06:00'), end: at('2026-09-15', '08:00') };
  assert.equal(conflicts(a, b, BUF), false);
});

test('4. a 30-minute gap before a job conflicts', () => {
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const b = { start: at('2026-09-15', '06:00'), end: at('2026-09-15', '08:30') };
  assert.equal(conflicts(a, b, BUF), true);
});

test('5. directly overlapping jobs conflict', () => {
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const b = { start: at('2026-09-15', '10:00'), end: at('2026-09-15', '12:00') };
  assert.equal(conflicts(a, b, BUF), true);
});

test('6. consecutive jobs need exactly ONE buffer width, not two', () => {
  // The bug this catches: padding both sides yields a 2-hour gap requirement.
  const a = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  for (const [gap, expectConflict] of [[59, true], [60, false], [61, false]] as const) {
    const b = {
      start: at('2026-09-15', '11:00') + gap * 60_000,
      end: at('2026-09-15', '11:00') + (gap + 120) * 60_000,
    };
    assert.equal(conflicts(a, b, BUF), expectConflict, `gap=${gap}min`);
  }
});

/* ================================================================== */
/* RULE 3 — always inspect the day before and after                   */
/* ================================================================== */

test('7. datesToInspect always includes D-1 and D+1', () => {
  const s = at('2026-09-15', '09:00');
  const e = at('2026-09-15', '11:00');
  assert.deepEqual(datesToInspect(s, e, TZ), ['2026-09-14', '2026-09-15', '2026-09-16']);
});

test('8. a late job on D-1 constrains an early start on D', () => {
  // The subtle one: the D-1 job does NOT cross midnight, so its block lives only
  // in the D-1 document. Reading only D and D+1 would miss it entirely and let a
  // 00:30 booking through with a 45-minute gap.
  const prev = { start: at('2026-09-14', '22:00'), end: at('2026-09-14', '23:45') };
  const tooSoon = { start: at('2026-09-15', '00:30'), end: at('2026-09-15', '03:00') };
  const farEnough = { start: at('2026-09-15', '00:45'), end: at('2026-09-15', '03:00') };

  const days = mapOf(day('crewA', '2026-09-14', [prev]));
  const inspect = datesToInspect(tooSoon.start, tooSoon.end, TZ);
  assert.ok(inspect.includes('2026-09-14'), 'must inspect the previous day');

  const existing = occupancyFor('crewA', inspect, days);
  assert.equal(existing.length, 1, 'the previous-day job must be visible');
  assert.equal(fits(tooSoon, existing, BUF), false, '45-minute gap must be rejected');
  assert.equal(fits(farEnough, existing, BUF), true, 'exactly 60 minutes is fine');
});

test('9. a job crossing midnight is indexed on both dates and deduped on read', () => {
  const s = at('2026-09-15', '22:00');
  const e = at('2026-09-16', '02:00');
  assert.deepEqual(datesSpanned(s, e, TZ), ['2026-09-15', '2026-09-16']);

  const days = mapOf(
    day('crewA', '2026-09-15', [{ start: s, end: e, id: 'same' }]),
    day('crewA', '2026-09-16', [{ start: s, end: e, id: 'same' }]),
  );
  const existing = occupancyFor('crewA', ['2026-09-15', '2026-09-16'], days);
  assert.equal(existing.length, 1, 'the same booking must not be counted twice');
});

/* ================================================================== */
/* Duration (RULE 2 — crew-independent)                               */
/* ================================================================== */

const service = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'svc', kind: 'service', name: 'Standard Janitorial', description: '',
  active: true, order: 1, ratePerSqFt: 0.10, minimumCharge: 175,
  productionRateSqFtPerCleanerHour: 3500, ...over,
});

test('10. duration does not depend on the assigned crew', () => {
  const s = sched({ quotingCrewHeadcount: 3 });
  const a = estimateDuration({ service: service(), squareFeet: 32000, addOns: [], settings: s });
  const b = estimateDuration({ service: service(), squareFeet: 32000, addOns: [], settings: s });
  assert.deepEqual(a, b);
  // 32000 / (3500*3) * 60 = 182.86 ; +20 setup = 202.86 ; round up 15 => 210
  assert.equal(a.minutes, 210);
});

test('11. the minimum job length is a floor', () => {
  const s = sched({ quotingCrewHeadcount: 3, minJobMinutes: 120 });
  const r = estimateDuration({ service: service(), squareFeet: 12000, addOns: [], settings: s });
  // 12000/(3500*3)*60 = 68.6 ; +20 = 88.6 ; round 90 ; floored to 120
  assert.equal(r.minutes, 120);
});

test('12. exceeding the maximum returns a manual quote, never a clamped job', () => {
  const s = sched({ quotingCrewHeadcount: 1, maxJobMinutes: 600 });
  const r = estimateDuration({ service: service(), squareFeet: 500000, addOns: [], settings: s });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'requires_manual_quote');
  assert.ok(r.minutes > 600, 'the real number is reported, not silently reduced');
});

test('13. add-on minutes extend the job', () => {
  const s = sched({ quotingCrewHeadcount: 2 });
  const addon: CatalogItem = {
    id: 'a1', kind: 'addon', name: 'Restroom', description: '', active: true,
    order: 1, price: 25, minutesPerUnit: 15, allowQuantity: true, unitLabel: 'per restroom',
  };
  const base = estimateDuration({ service: service(), squareFeet: 10000, addOns: [], settings: s });
  const withAdd = estimateDuration({
    service: service(), squareFeet: 10000,
    addOns: [{ item: addon, quantity: 4 }], settings: s,
  });
  assert.ok(withAdd.minutes >= base.minutes + 60, 'four restrooms add at least an hour');
});

/* ================================================================== */
/* Availability                                                        */
/* ================================================================== */

const NOW = at('2026-09-01', '09:00');

function availabilityFor(opts: {
  crews: Crew[]; days?: CrewDay[]; duration?: number; date?: string;
  settings?: Partial<SchedulingSettings>;
}) {
  return computeAvailability({
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

test('14. booking a slot removes it and everything within the buffer', () => {
  // Crew opens at 05:00 so both sides of the existing job are reachable.
  const early = crew({ hours: { ...defaultCrewHours(), tue: { enabled: true, start: 5 * 60, end: 19 * 60 } } });
  const existing = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const res = availabilityFor({
    crews: [early],
    days: [day('crewA', '2026-09-15', [existing])],
    duration: 120,
  });
  const labels = res.slots.map((s) => s.startLabel);
  assert.ok(!labels.includes('09:00'), 'the taken slot is gone');
  assert.ok(!labels.includes('08:00'), '08:00-10:00 would overlap');
  assert.ok(!labels.includes('07:30'), 'only a 30-minute gap before');
  assert.ok(!labels.includes('07:00'), '07:00-09:00 leaves a zero-minute gap');
  assert.ok(labels.includes('06:00'), '06:00-08:00 leaves exactly 60 minutes');
  assert.ok(labels.includes('12:00'), 'exactly 60 minutes after is bookable');
  assert.ok(!labels.includes('11:30'), 'only a 30-minute gap after');
});

test('15. with two crews the same time is bookable twice, and a third is refused', () => {
  const c1 = crew({ id: 'A', name: 'A', priority: 1 });
  const c2 = crew({ id: 'B', name: 'B', priority: 2 });
  const slot = at('2026-09-15', '09:00');

  const none = candidateCrews({
    start: slot, durationMinutes: 120, crews: [c1, c2],
    crewDays: mapOf(), settings: sched(), timezone: TZ,
  });
  assert.equal(none.length, 2, 'both crews free');

  const oneTaken = candidateCrews({
    start: slot, durationMinutes: 120, crews: [c1, c2],
    crewDays: mapOf(day('A', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }])),
    settings: sched(), timezone: TZ,
  });
  assert.deepEqual(oneTaken.map((c) => c.id), ['B']);

  const bothTaken = candidateCrews({
    start: slot, durationMinutes: 120, crews: [c1, c2],
    crewDays: mapOf(
      day('A', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }]),
      day('B', '2026-09-15', [{ start: slot, end: slot + 7.2e6 }]),
    ),
    settings: sched(), timezone: TZ,
  });
  assert.equal(bothTaken.length, 0, 'no crew left — the API must return 409');
});

test('16. deactivating a crew removes its future slots', () => {
  const active = availabilityFor({ crews: [crew()] });
  const inactive = availabilityFor({ crews: [crew({ active: false })] });
  assert.ok(active.slots.length > 0);
  assert.equal(inactive.slots.length, 0);
  assert.equal(inactive.reason, 'no_crews');
});

test('17. adding a crew with wider hours adds slots', () => {
  const narrow = availabilityFor({ crews: [crew()] });
  const extra = crew({
    id: 'B', name: 'B', priority: 2,
    hours: { ...defaultCrewHours(), tue: { enabled: true, start: 5 * 60, end: 23 * 60 } },
  });
  const wider = availabilityFor({ crews: [crew(), extra] });
  assert.ok(wider.slots.length > narrow.slots.length, 'more capacity, more slots');
});

test('18. per-crew hours are respected — a closed day yields nothing', () => {
  const closedTue = crew({
    hours: { ...defaultCrewHours(), tue: { enabled: false, start: 0, end: 0 } },
  });
  const res = availabilityFor({ crews: [closedTue], date: '2026-09-15' });
  assert.equal(res.slots.length, 0);
  assert.equal(res.reason, 'closed');
});

test('19. the service must fit inside working hours; the buffer may spill past', () => {
  const c = crew({ hours: { ...defaultCrewHours(), tue: { enabled: true, start: 8 * 60, end: 12 * 60 } } });
  const res = availabilityFor({ crews: [c], duration: 120 });
  const labels = res.slots.map((s) => s.startLabel);
  assert.deepEqual(labels, ['08:00', '08:30', '09:00', '09:30', '10:00']);
  assert.ok(!labels.includes('10:30'), '10:30 + 2h would run past close');
});

test('20. a per-crew blackout date removes that crew for the day', () => {
  const res = availabilityFor({ crews: [crew({ blackoutDates: ['2026-09-15'] })] });
  assert.equal(res.slots.length, 0);
});

test('21. a company blackout date returns no slots', () => {
  const res = computeAvailability({
    date: '2026-09-15', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
    settings: sched(), timezone: TZ, blackoutDates: new Set(['2026-09-15']), now: NOW,
  });
  assert.equal(res.reason, 'blackout');
  assert.equal(res.slots.length, 0);
});

test('22. minimum lead time is enforced', () => {
  const sameDay = computeAvailability({
    date: '2026-09-01', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
    settings: sched({ minLeadTimeHours: 24 }), timezone: TZ,
    blackoutDates: new Set(), now: NOW,
  });
  assert.equal(sameDay.slots.length, 0, 'nothing within 24h of now');
});

test('23. the booking horizon is enforced', () => {
  const res = computeAvailability({
    date: '2027-06-01', durationMinutes: 120, crews: [crew()], crewDays: mapOf(),
    settings: sched({ maxHorizonDays: 60 }), timezone: TZ,
    blackoutDates: new Set(), now: NOW,
  });
  assert.equal(res.reason, 'out_of_range');
});

test('24. changing the buffer widens gaps without touching existing bookings', () => {
  const existing = { start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') };
  const days = [day('crewA', '2026-09-15', [existing])];
  const at60 = availabilityFor({ crews: [crew()], days, settings: { travelBufferMinutes: 60 } });
  const at90 = availabilityFor({ crews: [crew()], days, settings: { travelBufferMinutes: 90 } });
  assert.ok(at60.slots.map((s) => s.startLabel).includes('12:00'));
  assert.ok(!at90.slots.map((s) => s.startLabel).includes('12:00'), '90-min buffer pushes it out');
  assert.ok(at90.slots.map((s) => s.startLabel).includes('12:30'));
});

test('25. a completed job still holds its slot (blocks are status-independent)', () => {
  // occupancyFor reads crew-day blocks and knows nothing about booking status,
  // which is exactly the point: marking a job complete at 14:00 while the crew
  // is still on site must not re-open 13:00-16:00 to a new customer.
  const existing = { start: at('2026-09-15', '13:00'), end: at('2026-09-15', '16:00') };
  const res = availabilityFor({
    crews: [crew()], days: [day('crewA', '2026-09-15', [existing])], duration: 120,
  });
  assert.ok(!res.slots.map((s) => s.startLabel).includes('13:00'));
});

test('26. cancelling frees the slot immediately', () => {
  const before = availabilityFor({
    crews: [crew()],
    days: [day('crewA', '2026-09-15', [{ start: at('2026-09-15', '09:00'), end: at('2026-09-15', '11:00') }])],
  });
  const after = availabilityFor({ crews: [crew()], days: [day('crewA', '2026-09-15', [])] });
  assert.ok(!before.slots.map((s) => s.startLabel).includes('09:00'));
  assert.ok(after.slots.map((s) => s.startLabel).includes('09:00'));
});

test('27. rescheduling excludes the booking from its own occupancy', () => {
  const start = at('2026-09-15', '09:00');
  const days = mapOf(day('crewA', '2026-09-15', [{ start, end: start + 7.2e6, id: 'me' }]));
  const nudged = start + 30 * 60_000;

  const blocked = candidateCrews({
    start: nudged, durationMinutes: 120, crews: [crew()],
    crewDays: days, settings: sched(), timezone: TZ,
  });
  assert.equal(blocked.length, 0, 'without the exclusion it collides with itself');

  const allowed = candidateCrews({
    start: nudged, durationMinutes: 120, crews: [crew()],
    crewDays: days, settings: sched(), timezone: TZ, excludeBookingId: 'me',
  });
  assert.equal(allowed.length, 1, 'with the exclusion the move is legal');
});

/* ================================================================== */
/* DST — the twice-a-year bug                                          */
/* ================================================================== */

test('28. spring-forward produces no duplicated or missing slots', () => {
  // 2027-03-14: US clocks jump 02:00 -> 03:00.
  const c = crew({ hours: { ...defaultCrewHours(), sun: { enabled: true, start: 0, end: 8 * 60 } } });
  const res = computeAvailability({
    date: '2027-03-14', durationMinutes: 120, crews: [c], crewDays: mapOf(),
    settings: sched({ minLeadTimeHours: 0, maxHorizonDays: 400, slotGranularityMinutes: 60 }),
    timezone: TZ, blackoutDates: new Set(), now: at('2027-03-01', '09:00'),
  });
  const labels = res.slots.map((s) => s.startLabel);
  assert.equal(new Set(labels).size, labels.length, 'no duplicated wall-clock times');
  assert.ok(!labels.includes('02:00'), '02:00 does not exist on this date');
});

test('29. fall-back does not create a duplicate hour', () => {
  // 2026-11-01: US clocks fall 02:00 -> 01:00.
  const c = crew({ hours: { ...defaultCrewHours(), sun: { enabled: true, start: 0, end: 8 * 60 } } });
  const res = computeAvailability({
    date: '2026-11-01', durationMinutes: 120, crews: [c], crewDays: mapOf(),
    settings: sched({ minLeadTimeHours: 0, maxHorizonDays: 400, slotGranularityMinutes: 60 }),
    timezone: TZ, blackoutDates: new Set(), now: at('2026-10-01', '09:00'),
  });
  const labels = res.slots.map((s) => s.startLabel);
  assert.equal(new Set(labels).size, labels.length, 'each wall-clock start appears once');
});

test('30. weekdayOf maps correctly across the week', () => {
  assert.equal(weekdayOf('2026-09-13', TZ), 'sun');
  assert.equal(weekdayOf('2026-09-14', TZ), 'mon');
  assert.equal(weekdayOf('2026-09-15', TZ), 'tue');
  assert.equal(weekdayOf('2026-09-19', TZ), 'sat');
});

/* ================================================================== */
/* Pricing                                                             */
/* ================================================================== */

const invoicing = (over: Partial<InvoicingSettings> = {}): InvoicingSettings =>
  ({ ...defaultSettings(TZ).invoicing, ...over });

const propType = (modifier: number, name = 'Office'): PropertyType =>
  ({ id: 'p1', name, modifier, active: true, order: 1 });

function quote(over: Partial<Parameters<typeof computeQuote>[0]> = {}) {
  return computeQuote({
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

test('31. the minimum charge is applied AFTER modifiers, not before', () => {
  // 1000 sq ft x $0.10 = $100 raw; x0.85 warehouse = $85; floor is $175.
  // Applying the floor first would give 175 x 0.85 = $148.75 — below the floor.
  const r = quote({
    squareFeet: 1000,
    propertyType: propType(0.85, 'Warehouse'),
  });
  assert.equal(r.subtotal, 175, 'never prices below the stated minimum');
});

test('32. modifiers scale the base when above the minimum', () => {
  const plain = quote({ squareFeet: 32000, propertyType: propType(1) });
  const medical = quote({ squareFeet: 32000, propertyType: propType(1.25, 'Medical') });
  assert.equal(plain.subtotal, 3200);
  assert.equal(medical.subtotal, 4000);
});

test('33. line items sum exactly to the subtotal', () => {
  const addon: CatalogItem = {
    id: 'a1', kind: 'addon', name: 'Restroom', description: '', active: true,
    order: 1, price: 25, minutesPerUnit: 15, allowQuantity: true,
  };
  const sur: Surcharge = {
    id: 's1', name: 'After hours', description: '', type: 'percent', value: 0.15,
    trigger: 'after_hours', beforeMinute: 420, afterMinute: 1080, active: true, order: 1,
  };
  const r = quote({
    addOns: [{ item: addon, quantity: 4 }],
    surcharges: [sur],
    startAt: at('2026-09-15', '19:00'),
  });
  const sum = round2(r.lineItems.reduce((s, l) => s + l.amount, 0));
  assert.equal(sum, r.subtotal, 'the breakdown a customer reads must add up');
  // 3200 base + 100 add-ons = 3300; +15% = 495 => 3795
  assert.equal(r.subtotal, 3795);
});

test('34. tax is computed on the subtotal including adjustments', () => {
  const r = quote({
    invoicing: invoicing({ taxRate: 0.10 }),
    extraLineItems: [{ key: 'adj', label: 'Extra scope', type: 'adjustment', amount: 400 }],
  });
  assert.equal(r.subtotal, 3600);
  assert.equal(r.taxAmount, 360, 'the adjustment is taxed, not bolted on after tax');
  assert.equal(r.total, 3960);
});

test('35. retotal matches computeQuote for the same line items', () => {
  const r = quote({ invoicing: invoicing({ taxRate: 0.08875 }) });
  const again = retotal(r.lineItems, 0.08875);
  assert.equal(again.subtotal, r.subtotal);
  assert.equal(again.total, r.total);
});

test('36. an inactive surcharge never applies', () => {
  const sur: Surcharge = {
    id: 's1', name: 'Weekend', description: '', type: 'percent', value: 0.10,
    trigger: 'weekend', active: false, order: 1,
  };
  const r = quote({ surcharges: [sur], startAt: at('2026-09-19', '09:00') });
  assert.equal(r.subtotal, 3200, 'switched off means zero effect');
});

test('37. the no-elevator surcharge needs both conditions', () => {
  const sur: Surcharge = {
    id: 's1', name: 'No elevator', description: '', type: 'flat', value: 50,
    trigger: 'no_elevator', minFloors: 2, active: true, order: 1,
  };
  assert.equal(quote({ surcharges: [sur], floors: 1, hasElevator: false }).subtotal, 3200);
  assert.equal(quote({ surcharges: [sur], floors: 3, hasElevator: true }).subtotal, 3200);
  assert.equal(quote({ surcharges: [sur], floors: 3, hasElevator: false }).subtotal, 3250);
});

test('38. an empty catalog fails cleanly instead of inventing a price', () => {
  const r = computeQuote({
    service: { ...service(), active: false },
    propertyType: null, squareFeet: 1000, floors: 1, hasElevator: true,
    addOns: [], surcharges: [], scheduling: sched(), invoicing: invoicing(), timezone: TZ,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_service');
  assert.equal(r.total, 0);
});

test('39. a job needing a manual quote reports ok:false but still itemises', () => {
  const r = quote({ squareFeet: 500000, scheduling: sched({ quotingCrewHeadcount: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'requires_manual_quote');
  assert.ok(r.subtotal > 0, 'admin can still see what it would have cost');
});

test('40. payout is hours x headcount x rate', () => {
  assert.equal(computePayout(3.8333, 3, 24), 276);
  assert.equal(computePayout(0, 3, 24), 0);
  assert.equal(computePayout(5, 0, 24), 0);
});
