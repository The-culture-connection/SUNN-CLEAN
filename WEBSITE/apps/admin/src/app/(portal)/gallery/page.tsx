import { listGallery, listServices, signedUrl } from '@sunnclean/shared';
import { GalleryEditor, type GalleryRow } from '@/components/GalleryEditor';

export const dynamic = 'force-dynamic';

/**
 * Gallery photos live in a private bucket, so the browser gets a short-lived
 * signed URL rather than a public link. Signing happens here because the client
 * component may not touch the shared package's runtime exports.
 */
async function preview(path: string | undefined): Promise<string> {
  if (!path) return '';
  try {
    return await signedUrl(path, 60);
  } catch {
    return '';
  }
}

export default async function GalleryPage() {
  // Unpublished pairs are included on purpose — this is where you switch them on.
  const [pairs, services] = await Promise.all([listGallery(false), listServices(false)]);

  const rows: GalleryRow[] = await Promise.all(pairs.map(async (pair) => ({
    pair,
    beforeUrl: await preview(pair.beforePath),
    afterUrl: await preview(pair.afterPath),
  })));

  const nextOrder = pairs.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 1;

  return (
    <GalleryEditor
      rows={rows}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      nextOrder={nextOrder}
    />
  );
}
