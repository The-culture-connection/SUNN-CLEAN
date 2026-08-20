import { z } from 'zod';
import {
  bucket, deleteGalleryPair, listGallery, listServices, saveGalleryPair,
  type GalleryPair,
} from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Before-and-after pairs shown on the public /gallery route.
 *
 * Consent is not decoration. A pair can never be created, and can never be
 * published, without a human ticking the box that says the client agreed —
 * and who ticked it is written into the document.
 */

const GallerySchema = z.object({
  id: z.string().min(1).optional(),
  caption: z.string().trim().min(1, 'Add a short caption so visitors know what they are looking at.').max(300),
  serviceId: z.string().max(120).default(''),
  jobLengthLabel: z.string().trim().max(80).default(''),
  consentConfirmed: z.boolean(),
  published: z.boolean(),
  featured: z.boolean().default(false),
  order: z.coerce.number().int().min(0).max(9999),
  beforePath: z.string().max(300).default(''),
  afterPath: z.string().max(300).default(''),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check the details and try again.';
}

/** Photos for this page live under public/gallery/ and nowhere else. */
function pathOk(path: string): boolean {
  return path === '' || (path.startsWith('public/gallery/') && !path.includes('..'));
}

/** Best effort — a photo left behind is untidy, a failed delete is not fatal. */
async function removeFile(path: string) {
  if (!path) return;
  try {
    await bucket().file(path).delete();
  } catch {
    // Already gone, or never written. Nothing useful to do about it here.
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = GallerySchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const d = parsed.data;

    if (!d.consentConfirmed) {
      return {
        ok: false,
        error: "Confirm you have the client's permission before saving these photos.",
      };
    }
    if (!pathOk(d.beforePath) || !pathOk(d.afterPath)) {
      return { ok: false, error: 'Those photo locations are not valid.' };
    }

    const existing = d.id
      ? (await listGallery(false)).find((g) => g.id === d.id) ?? null
      : null;
    if (d.id && !existing) return { ok: false, error: 'That pair has already been removed.' };

    // Publishing with no photos yet would leave a blank card on the website.
    const beforePath = d.beforePath || existing?.beforePath || '';
    const afterPath = d.afterPath || existing?.afterPath || '';
    if (d.published && (!beforePath || !afterPath)) {
      return {
        ok: false,
        error: 'This pair still needs both a before and an after photo before it can go live.',
      };
    }

    const service = d.serviceId
      ? (await listServices(false)).find((s) => s.id === d.serviceId) ?? null
      : null;

    const patch: Partial<GalleryPair> & { id?: string } = {
      id: d.id,
      caption: d.caption,
      serviceId: d.serviceId,
      serviceName: service?.name ?? '',
      jobLengthLabel: d.jobLengthLabel,
      beforePath,
      afterPath,
      consentConfirmed: true,
      consentConfirmedBy: existing?.consentConfirmedBy || user.email,
      published: d.published,
      featured: d.featured,
      order: d.order,
    };

    const id = await saveGalleryPair(patch);
    await logAction(
      user, existing ? 'gallery.update' : 'gallery.create', 'galleryPair', id,
      `${d.caption} · ${d.published ? 'published' : 'hidden'}`,
    );
    return { id };
  });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'Invalid request' };

    const existing = (await listGallery(false)).find((g) => g.id === parsed.data.id);
    if (!existing) return { ok: false, error: 'That pair has already been removed.' };

    // The photos go with the record — a withdrawn consent must leave nothing behind.
    await removeFile(existing.beforePath);
    await removeFile(existing.afterPath);
    await deleteGalleryPair(parsed.data.id);

    await logAction(user, 'gallery.delete', 'galleryPair', parsed.data.id, existing.caption);
    return { id: parsed.data.id };
  });
}
