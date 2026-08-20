/**
 * Firestore read/write helpers. Thin on purpose — the interesting logic lives in
 * scheduling.ts and pricing.ts, which are pure functions and therefore testable
 * without a database.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { COL, db } from './firebase.js';
import { defaultSettings } from './defaults.js';
import type {
  AppNotification, Blackout, Booking, CatalogItem, Certification, ContactMessage,
  Crew, CrewDay, GalleryPair, ISODate, Invoice, NotificationType, PropertyType,
  Review, Settings, Surcharge, AuditEntry,
} from './types.js';

const now = () => Date.now();

function withId<T>(snap: FirebaseFirestore.QueryDocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as object) } as T;
}

/* ---------------------------- settings ---------------------------- */

export async function getSettings(): Promise<Settings> {
  const ref = db().collection(COL.settings).doc('app');
  const snap = await ref.get();
  if (!snap.exists) return defaultSettings();
  const data = snap.data() as Partial<Settings>;
  const base = defaultSettings();
  // Merge so a settings doc written before a field existed still boots.
  return {
    business: { ...base.business, ...(data.business ?? {}) },
    scheduling: { ...base.scheduling, ...(data.scheduling ?? {}) },
    invoicing: { ...base.invoicing, ...(data.invoicing ?? {}) },
    content: { ...base.content, ...(data.content ?? {}) },
    updatedAt: data.updatedAt,
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db().collection(COL.settings).doc('app')
    .set({ ...patch, updatedAt: now() }, { merge: true });
}

/* ---------------------------- catalog ----------------------------- */

export async function listCatalog(opts: { activeOnly?: boolean } = {}): Promise<CatalogItem[]> {
  let q: FirebaseFirestore.Query = db().collection(COL.catalog);
  if (opts.activeOnly) q = q.where('active', '==', true);
  const snap = await q.get();
  return snap.docs.map((d) => withId<CatalogItem>(d))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export async function listServices(activeOnly = true): Promise<CatalogItem[]> {
  return (await listCatalog({ activeOnly })).filter((i) => i.kind === 'service');
}

export async function listAddOns(activeOnly = true): Promise<CatalogItem[]> {
  return (await listCatalog({ activeOnly })).filter((i) => i.kind === 'addon');
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const s = await db().collection(COL.catalog).doc(id).get();
  return s.exists ? ({ id: s.id, ...(s.data() as object) } as CatalogItem) : null;
}

export async function upsertCatalogItem(item: Partial<CatalogItem> & { id?: string }) {
  const col = db().collection(COL.catalog);
  const ref = item.id ? col.doc(item.id) : col.doc();
  const { id: _drop, ...rest } = item;
  await ref.set({ ...rest, updatedAt: now(), createdAt: item.id ? undefined : now() },
    { merge: true });
  return ref.id;
}

export async function deleteCatalogItem(id: string) {
  await db().collection(COL.catalog).doc(id).delete();
}

/* ------------------------- property types ------------------------- */

export async function listPropertyTypes(activeOnly = true): Promise<PropertyType[]> {
  const snap = await db().collection(COL.propertyTypes).get();
  return snap.docs.map((d) => withId<PropertyType>(d))
    .filter((p) => (activeOnly ? p.active : true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function upsertPropertyType(p: Partial<PropertyType> & { id?: string }) {
  const col = db().collection(COL.propertyTypes);
  const ref = p.id ? col.doc(p.id) : col.doc();
  const { id: _drop, ...rest } = p;
  await ref.set(rest, { merge: true });
  return ref.id;
}

export async function deletePropertyType(id: string) {
  await db().collection(COL.propertyTypes).doc(id).delete();
}

/* --------------------------- surcharges --------------------------- */

export async function listSurcharges(activeOnly = false): Promise<Surcharge[]> {
  const snap = await db().collection(COL.surcharges).get();
  return snap.docs.map((d) => withId<Surcharge>(d))
    .filter((s) => (activeOnly ? s.active : true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function upsertSurcharge(s: Partial<Surcharge> & { id?: string }) {
  const col = db().collection(COL.surcharges);
  const ref = s.id ? col.doc(s.id) : col.doc();
  const { id: _drop, ...rest } = s;
  await ref.set(rest, { merge: true });
  return ref.id;
}

export async function deleteSurcharge(id: string) {
  await db().collection(COL.surcharges).doc(id).delete();
}

/* ----------------------------- crews ------------------------------ */

export async function listCrews(activeOnly = false): Promise<Crew[]> {
  const snap = await db().collection(COL.crews).get();
  return snap.docs.map((d) => withId<Crew>(d))
    .filter((c) => (activeOnly ? c.active : true))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.name.localeCompare(b.name));
}

export async function getCrew(id: string): Promise<Crew | null> {
  const s = await db().collection(COL.crews).doc(id).get();
  return s.exists ? ({ id: s.id, ...(s.data() as object) } as Crew) : null;
}

export async function upsertCrew(c: Partial<Crew> & { id?: string }) {
  const col = db().collection(COL.crews);
  const ref = c.id ? col.doc(c.id) : col.doc();
  const { id: _drop, ...rest } = c;
  await ref.set({ ...rest, updatedAt: now(), createdAt: c.id ? undefined : now() },
    { merge: true });
  return ref.id;
}

/**
 * Deleting a crew is refused while it still has future work, because the
 * alternative is silently orphaning jobs someone is expecting to be cleaned.
 */
export async function deleteCrew(id: string): Promise<{ ok: boolean; reason?: string; count?: number }> {
  // Single-field query + in-memory filter, so no composite index is needed.
  const upcoming = await db().collection(COL.bookings)
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
  await db().collection(COL.crews).doc(id).delete();
  return { ok: true };
}

/* --------------------------- blackouts ---------------------------- */

export async function listBlackouts(): Promise<Blackout[]> {
  const snap = await db().collection(COL.blackouts).get();
  return snap.docs.map((d) => withId<Blackout>(d)).sort((a, b) => a.date.localeCompare(b.date));
}

export async function addBlackout(date: ISODate, label: string) {
  await db().collection(COL.blackouts).doc(date).set({ date, label });
}

export async function deleteBlackout(date: ISODate) {
  await db().collection(COL.blackouts).doc(date).delete();
}

/* --------------------------- crew days ---------------------------- */

export async function loadCrewDays(
  crewIds: string[], dates: ISODate[],
): Promise<Map<string, CrewDay>> {
  const out = new Map<string, CrewDay>();
  const ids: string[] = [];
  for (const c of crewIds) for (const d of dates) ids.push(`${c}_${d}`);
  if (ids.length === 0) return out;

  // getAll is capped in practice; chunk to stay well inside limits.
  const CHUNK = 250;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const refs = ids.slice(i, i + CHUNK).map((id) => db().collection(COL.crewDays).doc(id));
    const snaps = await db().getAll(...refs);
    for (const s of snaps) {
      if (s.exists) out.set(s.id, { id: s.id, ...(s.data() as object) } as CrewDay);
    }
  }
  return out;
}

/* ---------------------------- bookings ---------------------------- */

export async function getBooking(id: string): Promise<Booking | null> {
  const s = await db().collection(COL.bookings).doc(id).get();
  return s.exists ? ({ id: s.id, ...(s.data() as object) } as Booking) : null;
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
export async function listBookings(opts: {
  status?: string[]; from?: number; to?: number; crewId?: string; limit?: number;
} = {}): Promise<Booking[]> {
  let q: FirebaseFirestore.Query = db().collection(COL.bookings);
  if (opts.from != null) q = q.where('schedule.serviceStart', '>=', opts.from);
  if (opts.to != null) q = q.where('schedule.serviceStart', '<=', opts.to);
  q = q.orderBy('schedule.serviceStart', 'desc');

  // Over-fetch a little so in-memory filtering still returns a full page.
  const wantsFilter = !!opts.status?.length || !!opts.crewId;
  const limit = opts.limit ?? 200;
  q = q.limit(wantsFilter ? Math.min(limit * 5, 1000) : limit);

  const snap = await q.get();
  let rows = snap.docs.map((d) => withId<Booking>(d));
  if (opts.status?.length) rows = rows.filter((b) => opts.status!.includes(b.status));
  if (opts.crewId) rows = rows.filter((b) => b.schedule?.crewId === opts.crewId);
  return rows.slice(0, limit);
}

export async function findBookingByLookupHash(hash: string): Promise<Booking | null> {
  const snap = await db().collection(COL.bookings)
    .where('meta.lookupTokenHash', '==', hash).limit(1).get();
  return snap.empty ? null : withId<Booking>(snap.docs[0]);
}

export async function findBookingByReviewHash(hash: string): Promise<Booking | null> {
  const snap = await db().collection(COL.bookings)
    .where('meta.reviewTokenHash', '==', hash).limit(1).get();
  return snap.empty ? null : withId<Booking>(snap.docs[0]);
}

export async function updateBooking(id: string, patch: Record<string, unknown>) {
  await db().collection(COL.bookings).doc(id)
    .set({ ...patch, meta: { updatedAt: now() } }, { merge: true });
}

/* ---------------------------- counters ---------------------------- */

/** Sequential numbers via a transaction, so two bookings never collide. */
export async function nextSequence(name: string, prefix: string): Promise<string> {
  const ref = db().collection(COL.counters).doc(name);
  const year = new Date().getFullYear();
  const value = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { year?: number; value?: number }) : {};
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
export async function notify(n: {
  id?: string; type: NotificationType; severity?: AppNotification['severity'];
  title: string; body: string; link: string; relatedId?: string;
}) {
  const col = db().collection(COL.notifications);
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

export async function listNotifications(limit = 60): Promise<AppNotification[]> {
  const snap = await db().collection(COL.notifications)
    .orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => withId<AppNotification>(d));
}

export async function markNotificationRead(id: string, uid: string) {
  await db().collection(COL.notifications).doc(id)
    .set({ read: true, readByUid: uid, readAt: now() }, { merge: true });
}

export async function markAllNotificationsRead(uid: string) {
  const snap = await db().collection(COL.notifications).where('read', '==', false).get();
  const batch = db().batch();
  snap.docs.forEach((d) => batch.set(d.ref, { read: true, readByUid: uid, readAt: now() }, { merge: true }));
  await batch.commit();
}

export async function deleteNotificationsFor(relatedId: string, type: NotificationType) {
  const snap = await db().collection(COL.notifications)
    .where('relatedId', '==', relatedId).get();
  const batch = db().batch();
  snap.docs.filter((d) => d.data().type === type).forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/* ---------------------------- invoices ---------------------------- */

export async function listInvoices(limit = 200): Promise<Invoice[]> {
  const snap = await db().collection(COL.invoices)
    .orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => withId<Invoice>(d));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const s = await db().collection(COL.invoices).doc(id).get();
  return s.exists ? ({ id: s.id, ...(s.data() as object) } as Invoice) : null;
}

export async function saveInvoice(inv: Partial<Invoice> & { id?: string }) {
  const col = db().collection(COL.invoices);
  const ref = inv.id ? col.doc(inv.id) : col.doc();
  const { id: _drop, ...rest } = inv;
  await ref.set({ ...rest, updatedAt: now(), createdAt: inv.id ? undefined : now() }, { merge: true });
  return ref.id;
}

/* ----------------------------- reviews ---------------------------- */

export async function listReviews(status?: Review['status']): Promise<Review[]> {
  const snap = await db().collection(COL.reviews).get();
  if (status) {
    return snap.docs.map((d) => withId<Review>(d))
      .filter((r) => r.status === status)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }
  return snap.docs.map((d) => withId<Review>(d))
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export async function saveReview(r: Partial<Review> & { id?: string }) {
  const col = db().collection(COL.reviews);
  const ref = r.id ? col.doc(r.id) : col.doc();
  const { id: _drop, ...rest } = r;
  await ref.set(rest, { merge: true });
  return ref.id;
}

export async function deleteReview(id: string) {
  await db().collection(COL.reviews).doc(id).delete();
}

/** A review is verified when its email matches any completed booking. */
export async function emailHasCompletedBooking(email: string): Promise<string | null> {
  if (!email) return null;
  const snap = await db().collection(COL.bookings)
    .where('customer.email', '==', email.toLowerCase().trim())
    .limit(50).get();
  const match = snap.docs.find((d) => d.data().status === 'completed');
  return match ? match.id : null;
}

/* ----------------------------- gallery ---------------------------- */

export async function listGallery(publishedOnly = false): Promise<GalleryPair[]> {
  const snap = await db().collection(COL.gallery).get();
  return snap.docs.map((d) => withId<GalleryPair>(d))
    .filter((g) => (publishedOnly ? g.published : true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt - a.createdAt);
}

export async function saveGalleryPair(g: Partial<GalleryPair> & { id?: string }) {
  const col = db().collection(COL.gallery);
  const ref = g.id ? col.doc(g.id) : col.doc();
  const { id: _drop, ...rest } = g;
  await ref.set({ ...rest, updatedAt: now(), createdAt: g.id ? undefined : now() }, { merge: true });
  return ref.id;
}

export async function deleteGalleryPair(id: string) {
  await db().collection(COL.gallery).doc(id).delete();
}

/* ------------------------- certifications ------------------------- */

export async function listCertifications(publishedOnly = false): Promise<Certification[]> {
  const snap = await db().collection(COL.certifications).get();
  const today = new Date().toISOString().slice(0, 10);
  return snap.docs.map((d) => withId<Certification>(d))
    .filter((c) => {
      if (!publishedOnly) return true;
      if (!c.published) return false;
      // Expired credentials drop off the public page automatically.
      if (c.expiryDate && c.expiryDate < today) return false;
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export async function saveCertification(c: Partial<Certification> & { id?: string }) {
  const col = db().collection(COL.certifications);
  const ref = c.id ? col.doc(c.id) : col.doc();
  const { id: _drop, ...rest } = c;
  await ref.set({ ...rest, updatedAt: now(), createdAt: c.id ? undefined : now() }, { merge: true });
  return ref.id;
}

export async function deleteCertification(id: string) {
  await db().collection(COL.certifications).doc(id).delete();
}

/* ----------------------- contact & audit -------------------------- */

export async function saveContactMessage(m: Omit<ContactMessage, 'id'>) {
  const ref = await db().collection(COL.contact).add(m);
  return ref.id;
}

export async function listContactMessages(limit = 100): Promise<ContactMessage[]> {
  const snap = await db().collection(COL.contact)
    .orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => withId<ContactMessage>(d));
}

export async function audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>) {
  await db().collection(COL.audit).add({ ...entry, createdAt: now() });
}

export async function listAudit(targetId?: string, limit = 50): Promise<AuditEntry[]> {
  let q: FirebaseFirestore.Query = db().collection(COL.audit);
  if (targetId) q = q.where('targetId', '==', targetId);
  const snap = await q.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => withId<AuditEntry>(d));
}

export { FieldValue };
