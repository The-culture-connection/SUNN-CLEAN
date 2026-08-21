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
 * Every object in the bucket is private at the IAM level — including the ones
 * under `public/`. Firebase Storage rules govern the firebasestorage.googleapis.com
 * API, not storage.googleapis.com URLs, so a plain URL returns 403 regardless of
 * what storage.rules says. Mint a short-lived signed URL for everything instead.
 * The pages that call this are force-dynamic, so each render issues a fresh URL.
 */
async function publicUrl(path: string): Promise<string> {
  if (!path) return '';
  try {
    return await signedUrl(path, 60);
  } catch (err) {
    console.error('[storage] could not sign', path, err instanceof Error ? err.message : err);
    return '';
  }
}

export { publicUrl };
