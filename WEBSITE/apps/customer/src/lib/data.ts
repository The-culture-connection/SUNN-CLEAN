import 'server-only';
import {
  getSettings, listServices, listAddOns, listPropertyTypes, listSurcharges,
  listCrews, listBlackouts, listGallery, listCertifications, listReviews,
  signedUrl,
} from '@sunnclean/shared';

/** Public pages are server-rendered; nothing here ever runs in the browser. */
export const revalidate = 0;

export async function loadPublicData() {
  const [settings, services, addOns, propertyTypes] = await Promise.all([
    getSettings(), listServices(true), listAddOns(true), listPropertyTypes(true),
  ]);
  return { settings, services, addOns, propertyTypes };
}

export async function loadBookingData() {
  const [settings, services, addOns, propertyTypes, surcharges, crews, blackouts] =
    await Promise.all([
      getSettings(), listServices(true), listAddOns(true), listPropertyTypes(true),
      listSurcharges(true), listCrews(true), listBlackouts(),
    ]);
  return { settings, services, addOns, propertyTypes, surcharges, crews, blackouts };
}

export async function loadGallery() {
  const pairs = await listGallery(true);
  return Promise.all(pairs.map(async (p) => ({
    ...p,
    beforeUrl: p.beforePath ? await publicUrl(p.beforePath) : '',
    afterUrl: p.afterPath ? await publicUrl(p.afterPath) : '',
  })));
}

export async function loadCertifications() {
  const certs = await listCertifications(true);
  return Promise.all(certs.map(async (c) => ({
    ...c,
    badgeUrl: c.badgeImagePath ? await publicUrl(c.badgeImagePath) : '',
    documentUrl: c.documentPath ? await publicUrl(c.documentPath) : '',
  })));
}

export async function loadReviews() {
  const all = await listReviews('approved');
  const withPhotos = await Promise.all(all.map(async (r) => ({
    ...r,
    photoUrls: await Promise.all((r.photoPaths ?? []).map((p) => publicUrl(p))),
  })));
  const count = withPhotos.length;
  const sum = withPhotos.reduce((s, r) => s + r.rating, 0);
  const average = count ? Math.round((sum / count) * 10) / 10 : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star, count: withPhotos.filter((r) => r.rating === star).length,
  }));
  return { reviews: withPhotos, count, average, distribution };
}

/**
 * Objects under `public/` are world-readable, so a plain URL is enough and it
 * can be cached by the browser. Anything else gets a short-lived signed URL.
 */
async function publicUrl(path: string): Promise<string> {
  if (path.startsWith('public/')) {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    return `https://storage.googleapis.com/${bucketName}/${path}`;
  }
  try { return await signedUrl(path, 60); } catch { return ''; }
}

export { publicUrl };
