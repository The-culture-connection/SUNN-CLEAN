"use strict";
/**
 * SUNN CLEAN — shared domain types.
 *
 * Design rule that matters: NOTHING about pricing or job duration is hardcoded.
 * Every rate, minimum, production rate and surcharge lives in Firestore and is
 * edited by Grace in the admin portal. This file only describes the shape.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEEKDAY_LABELS = exports.WEEKDAYS = void 0;
exports.WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
exports.WEEKDAY_LABELS = {
    sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
    thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};
