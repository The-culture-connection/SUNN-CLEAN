"use strict";
/**
 * Firestore read/write helpers. Thin on purpose — the interesting logic lives in
 * scheduling.ts and pricing.ts, which are pure functions and therefore testable
 * without a database.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldValue = void 0;
exports.getSettings = getSettings;
exports.saveSettings = saveSettings;
exports.listCatalog = listCatalog;
exports.listServices = listServices;
exports.listAddOns = listAddOns;
exports.getCatalogItem = getCatalogItem;
exports.upsertCatalogItem = upsertCatalogItem;
exports.deleteCatalogItem = deleteCatalogItem;
exports.listPropertyTypes = listPropertyTypes;
exports.upsertPropertyType = upsertPropertyType;
exports.deletePropertyType = deletePropertyType;
exports.listSurcharges = listSurcharges;
exports.upsertSurcharge = upsertSurcharge;
exports.deleteSurcharge = deleteSurcharge;
exports.listCrews = listCrews;
exports.getCrew = getCrew;
exports.upsertCrew = upsertCrew;
exports.deleteCrew = deleteCrew;
exports.listBlackouts = listBlackouts;
exports.addBlackout = addBlackout;
exports.deleteBlackout = deleteBlackout;
exports.loadCrewDays = loadCrewDays;
exports.getBooking = getBooking;
exports.listBookings = listBookings;
exports.findBookingByLookupHash = findBookingByLookupHash;
exports.findBookingByReviewHash = findBookingByReviewHash;
exports.updateBooking = updateBooking;
exports.nextSequence = nextSequence;
exports.notify = notify;
exports.listNotifications = listNotifications;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
exports.deleteNotificationsFor = deleteNotificationsFor;
exports.listInvoices = listInvoices;
exports.getInvoice = getInvoice;
exports.saveInvoice = saveInvoice;
exports.listReviews = listReviews;
exports.saveReview = saveReview;
exports.deleteReview = deleteReview;
exports.emailHasCompletedBooking = emailHasCompletedBooking;
exports.listGallery = listGallery;
exports.saveGalleryPair = saveGalleryPair;
exports.deleteGalleryPair = deleteGalleryPair;
exports.listCertifications = listCertifications;
exports.saveCertification = saveCertification;
exports.deleteCertification = deleteCertification;
exports.saveContactMessage = saveContactMessage;
exports.listContactMessages = listContactMessages;
exports.audit = audit;
exports.listAudit = listAudit;
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
const firebase_js_1 = require("./firebase.js");
const defaults_js_1 = require("./defaults.js");
const now = () => Date.now();
function withId(snap) {
    return { id: snap.id, ...snap.data() };
}
/* ---------------------------- settings ---------------------------- */
async function getSettings() {
    const ref = (0, firebase_js_1.db)().collection(firebase_js_1.COL.settings).doc('app');
    const snap = await ref.get();
    if (!snap.exists)
        return (0, defaults_js_1.defaultSettings)();
    const data = snap.data();
    const base = (0, defaults_js_1.defaultSettings)();
    // Merge so a settings doc written before a field existed still boots.
    return {
        business: { ...base.business, ...(data.business ?? {}) },
        scheduling: { ...base.scheduling, ...(data.scheduling ?? {}) },
        invoicing: { ...base.invoicing, ...(data.invoicing ?? {}) },
        content: { ...base.content, ...(data.content ?? {}) },
        updatedAt: data.updatedAt,
    };
}
async function saveSettings(patch) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.settings).doc('app')
        .set({ ...patch, updatedAt: now() }, { merge: true });
}
/* ---------------------------- catalog ----------------------------- */
async function listCatalog(opts = {}) {
    let q = (0, firebase_js_1.db)().collection(firebase_js_1.COL.catalog);
    if (opts.activeOnly)
        q = q.where('active', '==', true);
    const snap = await q.get();
    return snap.docs.map((d) => withId(d))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}
async function listServices(activeOnly = true) {
    return (await listCatalog({ activeOnly })).filter((i) => i.kind === 'service');
}
async function listAddOns(activeOnly = true) {
    return (await listCatalog({ activeOnly })).filter((i) => i.kind === 'addon');
}
async function getCatalogItem(id) {
    const s = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.catalog).doc(id).get();
    return s.exists ? { id: s.id, ...s.data() } : null;
}
async function upsertCatalogItem(item) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.catalog);
    const ref = item.id ? col.doc(item.id) : col.doc();
    const { id: _drop, ...rest } = item;
    await ref.set({ ...rest, updatedAt: now(), createdAt: item.id ? undefined : now() }, { merge: true });
    return ref.id;
}
async function deleteCatalogItem(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.catalog).doc(id).delete();
}
/* ------------------------- property types ------------------------- */
async function listPropertyTypes(activeOnly = true) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.propertyTypes).get();
    return snap.docs.map((d) => withId(d))
        .filter((p) => (activeOnly ? p.active : true))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
async function upsertPropertyType(p) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.propertyTypes);
    const ref = p.id ? col.doc(p.id) : col.doc();
    const { id: _drop, ...rest } = p;
    await ref.set(rest, { merge: true });
    return ref.id;
}
async function deletePropertyType(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.propertyTypes).doc(id).delete();
}
/* --------------------------- surcharges --------------------------- */
async function listSurcharges(activeOnly = false) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.surcharges).get();
    return snap.docs.map((d) => withId(d))
        .filter((s) => (activeOnly ? s.active : true))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
async function upsertSurcharge(s) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.surcharges);
    const ref = s.id ? col.doc(s.id) : col.doc();
    const { id: _drop, ...rest } = s;
    await ref.set(rest, { merge: true });
    return ref.id;
}
async function deleteSurcharge(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.surcharges).doc(id).delete();
}
/* ----------------------------- crews ------------------------------ */
async function listCrews(activeOnly = false) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.crews).get();
    return snap.docs.map((d) => withId(d))
        .filter((c) => (activeOnly ? c.active : true))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.name.localeCompare(b.name));
}
async function getCrew(id) {
    const s = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.crews).doc(id).get();
    return s.exists ? { id: s.id, ...s.data() } : null;
}
async function upsertCrew(c) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.crews);
    const ref = c.id ? col.doc(c.id) : col.doc();
    const { id: _drop, ...rest } = c;
    await ref.set({ ...rest, updatedAt: now(), createdAt: c.id ? undefined : now() }, { merge: true });
    return ref.id;
}
/**
 * Deleting a crew is refused while it still has future work, because the
 * alternative is silently orphaning jobs someone is expecting to be cleaned.
 */
async function deleteCrew(id) {
    // Single-field query + in-memory filter, so no composite index is needed.
    const upcoming = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings)
        .where('schedule.serviceStart', '>=', Date.now())
        .get();
    const future = upcoming.docs.filter((d) => {
        const data = d.data();
        return data.schedule?.crewId === id
            && ['pending', 'confirmed'].includes(data.status);
    });
    if (future.length > 0) {
        return { ok: false, reason: 'has_upcoming_jobs', count: future.length };
    }
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.crews).doc(id).delete();
    return { ok: true };
}
/* --------------------------- blackouts ---------------------------- */
async function listBlackouts() {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.blackouts).get();
    return snap.docs.map((d) => withId(d)).sort((a, b) => a.date.localeCompare(b.date));
}
async function addBlackout(date, label) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.blackouts).doc(date).set({ date, label });
}
async function deleteBlackout(date) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.blackouts).doc(date).delete();
}
/* --------------------------- crew days ---------------------------- */
async function loadCrewDays(crewIds, dates) {
    const out = new Map();
    const ids = [];
    for (const c of crewIds)
        for (const d of dates)
            ids.push(`${c}_${d}`);
    if (ids.length === 0)
        return out;
    // getAll is capped in practice; chunk to stay well inside limits.
    const CHUNK = 250;
    for (let i = 0; i < ids.length; i += CHUNK) {
        const refs = ids.slice(i, i + CHUNK).map((id) => (0, firebase_js_1.db)().collection(firebase_js_1.COL.crewDays).doc(id));
        const snaps = await (0, firebase_js_1.db)().getAll(...refs);
        for (const s of snaps) {
            if (s.exists)
                out.set(s.id, { id: s.id, ...s.data() });
        }
    }
    return out;
}
/* ---------------------------- bookings ---------------------------- */
async function getBooking(id) {
    const s = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(id).get();
    return s.exists ? { id: s.id, ...s.data() } : null;
}
/**
 * Deliberately uses ONE indexed field (`schedule.serviceStart`) and filters
 * status/crew in memory.
 *
 * Combining a range filter with an `in` filter and an orderBy would require a
 * composite index, which means the app returns 500s on the day it deploys until
 * the index finishes building — a genuinely bad first impression for something
 * a small business just paid to have built. Single-field indexes are automatic,
 * so this works immediately. At this volume (tens of bookings a week) the
 * in-memory filter costs nothing.
 */
async function listBookings(opts = {}) {
    let q = (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings);
    if (opts.from != null)
        q = q.where('schedule.serviceStart', '>=', opts.from);
    if (opts.to != null)
        q = q.where('schedule.serviceStart', '<=', opts.to);
    q = q.orderBy('schedule.serviceStart', 'desc');
    // Over-fetch a little so in-memory filtering still returns a full page.
    const wantsFilter = !!opts.status?.length || !!opts.crewId;
    const limit = opts.limit ?? 200;
    q = q.limit(wantsFilter ? Math.min(limit * 5, 1000) : limit);
    const snap = await q.get();
    let rows = snap.docs.map((d) => withId(d));
    if (opts.status?.length)
        rows = rows.filter((b) => opts.status.includes(b.status));
    if (opts.crewId)
        rows = rows.filter((b) => b.schedule?.crewId === opts.crewId);
    return rows.slice(0, limit);
}
async function findBookingByLookupHash(hash) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings)
        .where('meta.lookupTokenHash', '==', hash).limit(1).get();
    return snap.empty ? null : withId(snap.docs[0]);
}
async function findBookingByReviewHash(hash) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings)
        .where('meta.reviewTokenHash', '==', hash).limit(1).get();
    return snap.empty ? null : withId(snap.docs[0]);
}
async function updateBooking(id, patch) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings).doc(id)
        .set({ ...patch, meta: { updatedAt: now() } }, { merge: true });
}
/* ---------------------------- counters ---------------------------- */
/** Sequential numbers via a transaction, so two bookings never collide. */
async function nextSequence(name, prefix) {
    const ref = (0, firebase_js_1.db)().collection(firebase_js_1.COL.counters).doc(name);
    const year = new Date().getFullYear();
    const value = await (0, firebase_js_1.db)().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const nextVal = data.year === year ? (data.value ?? 0) + 1 : 1;
        tx.set(ref, { year, value: nextVal }, { merge: true });
        return nextVal;
    });
    return `${prefix}-${year}-${String(value).padStart(4, '0')}`;
}
/* -------------------------- notifications ------------------------- */
/**
 * Deterministic IDs for anything a scheduled job creates, so hourly/daily
 * re-runs overwrite instead of piling up. `read` is never reset on merge.
 */
async function notify(n) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications);
    const ref = n.id ? col.doc(n.id) : col.doc();
    const existing = n.id ? await ref.get() : null;
    await ref.set({
        type: n.type,
        severity: n.severity ?? 'action',
        title: n.title,
        body: n.body,
        link: n.link,
        relatedId: n.relatedId,
        ...(existing?.exists ? {} : { read: false, createdAt: now() }),
    }, { merge: true });
    return ref.id;
}
async function listNotifications(limit = 60) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications)
        .orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => withId(d));
}
async function markNotificationRead(id, uid) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications).doc(id)
        .set({ read: true, readByUid: uid, readAt: now() }, { merge: true });
}
async function markAllNotificationsRead(uid) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications).where('read', '==', false).get();
    const batch = (0, firebase_js_1.db)().batch();
    snap.docs.forEach((d) => batch.set(d.ref, { read: true, readByUid: uid, readAt: now() }, { merge: true }));
    await batch.commit();
}
async function deleteNotificationsFor(relatedId, type) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.notifications)
        .where('relatedId', '==', relatedId).get();
    const batch = (0, firebase_js_1.db)().batch();
    snap.docs.filter((d) => d.data().type === type).forEach((d) => batch.delete(d.ref));
    await batch.commit();
}
/* ---------------------------- invoices ---------------------------- */
async function listInvoices(limit = 200) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.invoices)
        .orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => withId(d));
}
async function getInvoice(id) {
    const s = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.invoices).doc(id).get();
    return s.exists ? { id: s.id, ...s.data() } : null;
}
async function saveInvoice(inv) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.invoices);
    const ref = inv.id ? col.doc(inv.id) : col.doc();
    const { id: _drop, ...rest } = inv;
    await ref.set({ ...rest, updatedAt: now(), createdAt: inv.id ? undefined : now() }, { merge: true });
    return ref.id;
}
/* ----------------------------- reviews ---------------------------- */
async function listReviews(status) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.reviews).get();
    if (status) {
        return snap.docs.map((d) => withId(d))
            .filter((r) => r.status === status)
            .sort((a, b) => b.submittedAt - a.submittedAt);
    }
    return snap.docs.map((d) => withId(d))
        .sort((a, b) => b.submittedAt - a.submittedAt);
}
async function saveReview(r) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.reviews);
    const ref = r.id ? col.doc(r.id) : col.doc();
    const { id: _drop, ...rest } = r;
    await ref.set(rest, { merge: true });
    return ref.id;
}
async function deleteReview(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.reviews).doc(id).delete();
}
/** A review is verified when its email matches any completed booking. */
async function emailHasCompletedBooking(email) {
    if (!email)
        return null;
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.bookings)
        .where('customer.email', '==', email.toLowerCase().trim())
        .limit(50).get();
    const match = snap.docs.find((d) => d.data().status === 'completed');
    return match ? match.id : null;
}
/* ----------------------------- gallery ---------------------------- */
async function listGallery(publishedOnly = false) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.gallery).get();
    return snap.docs.map((d) => withId(d))
        .filter((g) => (publishedOnly ? g.published : true))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt - a.createdAt);
}
async function saveGalleryPair(g) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.gallery);
    const ref = g.id ? col.doc(g.id) : col.doc();
    const { id: _drop, ...rest } = g;
    await ref.set({ ...rest, updatedAt: now(), createdAt: g.id ? undefined : now() }, { merge: true });
    return ref.id;
}
async function deleteGalleryPair(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.gallery).doc(id).delete();
}
/* ------------------------- certifications ------------------------- */
async function listCertifications(publishedOnly = false) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.certifications).get();
    const today = new Date().toISOString().slice(0, 10);
    return snap.docs.map((d) => withId(d))
        .filter((c) => {
        if (!publishedOnly)
            return true;
        if (!c.published)
            return false;
        // Expired credentials drop off the public page automatically.
        if (c.expiryDate && c.expiryDate < today)
            return false;
        return true;
    })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}
async function saveCertification(c) {
    const col = (0, firebase_js_1.db)().collection(firebase_js_1.COL.certifications);
    const ref = c.id ? col.doc(c.id) : col.doc();
    const { id: _drop, ...rest } = c;
    await ref.set({ ...rest, updatedAt: now(), createdAt: c.id ? undefined : now() }, { merge: true });
    return ref.id;
}
async function deleteCertification(id) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.certifications).doc(id).delete();
}
/* ----------------------- contact & audit -------------------------- */
async function saveContactMessage(m) {
    const ref = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.contact).add(m);
    return ref.id;
}
async function listContactMessages(limit = 100) {
    const snap = await (0, firebase_js_1.db)().collection(firebase_js_1.COL.contact)
        .orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => withId(d));
}
async function audit(entry) {
    await (0, firebase_js_1.db)().collection(firebase_js_1.COL.audit).add({ ...entry, createdAt: now() });
}
async function listAudit(targetId, limit = 50) {
    let q = (0, firebase_js_1.db)().collection(firebase_js_1.COL.audit);
    if (targetId)
        q = q.where('targetId', '==', targetId);
    const snap = await q.orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => withId(d));
}
