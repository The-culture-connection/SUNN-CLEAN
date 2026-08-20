"use strict";
/**
 * SUNN CLEAN — pricing engine.
 *
 * Every rate comes from Firestore. There are no hardcoded prices anywhere in
 * this file: Grace creates services and add-ons in the admin portal and this
 * code only applies the arithmetic.
 *
 * ORDER MATTERS. The minimum charge is applied AFTER the modifiers, not before.
 * Applying it first means it isn't a minimum: a warehouse (x0.85) would price a
 * $175 floor down to $148.75.
 *
 *   rawBase      = squareFeet x ratePerSqFt
 *   modifiedBase = rawBase x propertyModifier
 *   base         = max(modifiedBase, minimumCharge)      <- floor applied last
 *   subtotal     = base + addOns + surcharges - discounts + adjustments
 *   tax          = subtotal x taxRate
 *   total        = subtotal + tax
 *
 * Admin adjustments are ORDINARY LINE ITEMS, not a separate array. That is why
 * the same function computes the booking estimate and the final invoice: adding
 * an adjustment re-runs subtotal -> tax -> total, so tax stays correct.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.money = money;
exports.surchargeApplies = surchargeApplies;
exports.computeQuote = computeQuote;
exports.retotal = retotal;
exports.computePayout = computePayout;
const luxon_1 = require("luxon");
const scheduling_js_1 = require("./scheduling.js");
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function money(n) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
/* ------------------------------------------------------------------ */
/* Surcharge matching                                                  */
/* ------------------------------------------------------------------ */
function surchargeApplies(s, opts) {
    if (!s.active)
        return false;
    const { startAt, timezone, floors, hasElevator } = opts;
    switch (s.trigger) {
        case 'manual':
            return false; // admin adds these by hand on the booking
        case 'no_elevator':
            return !hasElevator && floors >= (s.minFloors ?? 2);
        case 'after_hours': {
            if (startAt == null)
                return false;
            const dt = luxon_1.DateTime.fromMillis(startAt, { zone: timezone });
            const minute = dt.hour * 60 + dt.minute;
            const before = s.beforeMinute ?? 7 * 60;
            const after = s.afterMinute ?? 18 * 60;
            return minute < before || minute >= after;
        }
        case 'weekend': {
            if (startAt == null)
                return false;
            const wd = luxon_1.DateTime.fromMillis(startAt, { zone: timezone }).weekday; // 6=Sat 7=Sun
            return wd === 6 || wd === 7;
        }
        case 'holiday':
            return false; // admin applies manually; no holiday calendar in Phase 1
        default:
            return false;
    }
}
/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */
function computeQuote(input) {
    const { service, propertyType, squareFeet, floors, hasElevator, addOns, surcharges, scheduling, invoicing, timezone, startAt, extraLineItems = [], } = input;
    const emptySnapshot = {
        serviceName: service?.name ?? '',
        ratePerSqFt: service?.ratePerSqFt ?? 0,
        minimumCharge: service?.minimumCharge ?? 0,
        productionRate: service?.productionRateSqFtPerCleanerHour ?? 0,
        propertyTypeName: propertyType?.name ?? 'Standard',
        propertyModifier: propertyType?.modifier ?? 1,
        quotingHeadcount: scheduling.quotingCrewHeadcount,
        setupMinutes: scheduling.setupMinutes,
        taxRate: invoicing.taxRate,
    };
    const fail = (reason, durationMinutes = 0) => ({
        ok: false, reason, durationMinutes, lineItems: [], subtotal: 0,
        taxRate: invoicing.taxRate, taxAmount: 0, total: 0, rateSnapshot: emptySnapshot,
    });
    if (!service || service.kind !== 'service' || !service.active)
        return fail('invalid_service');
    if (!(squareFeet > 0))
        return fail('invalid_input');
    const rate = service.ratePerSqFt ?? 0;
    const minimum = service.minimumCharge ?? 0;
    const modifier = propertyType?.modifier ?? 1;
    const duration = (0, scheduling_js_1.estimateDuration)({
        service, squareFeet, addOns, settings: scheduling,
    });
    const lineItems = [];
    /* --- base ------------------------------------------------------- */
    const rawBase = round2(squareFeet * rate);
    const modifiedBase = round2(rawBase * modifier);
    const base = round2(Math.max(modifiedBase, minimum));
    lineItems.push({
        key: 'base',
        label: `${service.name} — ${squareFeet.toLocaleString()} sq ft`,
        type: 'base',
        quantity: squareFeet,
        unitPrice: rate,
        amount: rawBase,
    });
    if (modifier !== 1 && propertyType) {
        lineItems.push({
            key: 'property_modifier',
            label: `${propertyType.name} rate`,
            type: 'modifier',
            multiplier: modifier,
            amount: 0, // display-only; the effect is folded into `base`
        });
    }
    const flooredByMinimum = modifiedBase < minimum && minimum > 0;
    if (flooredByMinimum) {
        lineItems.push({
            key: 'service_minimum',
            label: `${service.name} minimum charge`,
            type: 'modifier',
            amount: 0,
            note: `Minimum ${money(minimum)} applied`,
        });
    }
    // Reconcile: the base row shows rawBase, so emit the delta as its own row
    // when modifiers or the floor changed the number. Keeps the column summable.
    const baseDelta = round2(base - rawBase);
    if (baseDelta !== 0) {
        lineItems.push({
            key: 'base_adjusted',
            label: flooredByMinimum ? 'Adjusted to minimum' : 'Property type adjustment',
            type: 'modifier',
            amount: baseDelta,
        });
    }
    /* --- add-ons ---------------------------------------------------- */
    let addOnTotal = 0;
    for (const a of addOns) {
        if (!a.item || a.item.kind !== 'addon' || !a.item.active)
            continue;
        const qty = a.item.allowQuantity === false ? 1 : Math.max(0, Math.floor(a.quantity));
        if (qty <= 0)
            continue;
        const unit = a.item.price ?? 0;
        const total = round2(unit * qty);
        addOnTotal = round2(addOnTotal + total);
        lineItems.push({
            key: `addon:${a.item.id}`,
            label: qty > 1 ? `${a.item.name} ×${qty}` : a.item.name,
            type: 'addon',
            quantity: qty,
            unitPrice: unit,
            amount: total,
        });
    }
    /* --- surcharges ------------------------------------------------- */
    const surchargeBase = round2(base + addOnTotal);
    let surchargeTotal = 0;
    for (const s of surcharges) {
        if (!surchargeApplies(s, { startAt, timezone, floors, hasElevator }))
            continue;
        const amount = s.type === 'percent'
            ? round2(surchargeBase * s.value)
            : round2(s.value);
        if (amount === 0)
            continue;
        surchargeTotal = round2(surchargeTotal + amount);
        lineItems.push({
            key: `surcharge:${s.id}`,
            label: s.type === 'percent' ? `${s.name} (+${(s.value * 100).toFixed(0)}%)` : s.name,
            type: 'surcharge',
            multiplier: s.type === 'percent' ? s.value : undefined,
            amount,
        });
    }
    /* --- adjustments (admin) ---------------------------------------- */
    for (const e of extraLineItems)
        lineItems.push(e);
    const extraTotal = extraLineItems.reduce((sum, l) => round2(sum + l.amount), 0);
    /* --- totals ----------------------------------------------------- */
    const subtotal = round2(base + addOnTotal + surchargeTotal + extraTotal);
    const taxRate = invoicing.taxRate ?? 0;
    const taxAmount = round2(subtotal * taxRate);
    const total = round2(subtotal + taxAmount);
    const rateSnapshot = { ...emptySnapshot };
    if (!duration.ok) {
        return {
            ok: false,
            reason: duration.reason === 'requires_manual_quote' ? 'requires_manual_quote' : 'invalid_service',
            durationMinutes: duration.minutes,
            lineItems, subtotal, taxRate, taxAmount, total, rateSnapshot,
        };
    }
    return {
        ok: true,
        durationMinutes: duration.minutes,
        lineItems, subtotal, taxRate, taxAmount, total, rateSnapshot,
    };
}
/**
 * Recompute totals from an existing line-item list — used when an admin adds or
 * removes an adjustment on a booking that already exists. Single code path with
 * computeQuote for the arithmetic that matters (subtotal -> tax -> total).
 */
function retotal(lineItems, taxRate) {
    const subtotal = round2(lineItems.reduce((sum, l) => round2(sum + l.amount), 0));
    const taxAmount = round2(subtotal * (taxRate ?? 0));
    return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}
/** Payout owed for a completed job. Tracking only — the app pays no one. */
function computePayout(actualLaborHours, headcount, hourlyCostPerCleaner) {
    return round2(Math.max(0, actualLaborHours) * Math.max(0, headcount) * Math.max(0, hourlyCostPerCleaner));
}
