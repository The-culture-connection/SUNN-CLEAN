import { z } from 'zod';
import { bucket } from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Shared upload endpoint for the gallery, certification badges and
 * certification documents.
 *
 * The browser sends a base64 data URL rather than multipart form data because
 * every caller has already put the file through a canvas to shrink it, and a
 * data URL is what a canvas hands back. Images arrive at most 2000px on the
 * long edge, so an 8 MB ceiling is generous for a photo and still small enough
 * that a bad upload cannot fill the bucket.
 */

const CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

const MAX_BYTES = 8 * 1024 * 1024;

/** Base64 inflates by ~4/3, plus the "data:...;base64," preamble. */
const MAX_DATA_URL_CHARS = Math.ceil(MAX_BYTES * 1.4) + 200;

/**
 * Uploads may only land in the two prefixes the public website understands.
 * Anything else — including a path with ".." in it — is refused, so a bad
 * request cannot overwrite an unrelated object.
 */
const SAFE_PATH = /^(public|quarantine)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.[A-Za-z0-9]+$/;

const UploadSchema = z.object({
  dataUrl: z.string().min(1).max(MAX_DATA_URL_CHARS, 'That file is too large. The limit is 8 MB.'),
  path: z.string().min(3).max(300),
  contentType: z.enum(CONTENT_TYPES, {
    errorMap: () => ({ message: 'Please upload a JPEG, PNG, WebP or PDF.' }),
  }),
});

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'That file could not be uploaded.';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = UploadSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { dataUrl, path, contentType } = parsed.data;

    if (path.includes('..') || !SAFE_PATH.test(path)) {
      return { ok: false, error: 'That file cannot be saved to that location.' };
    }

    const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) {
      return { ok: false, error: 'That file did not arrive in a form we can read. Please try again.' };
    }
    if (match[1].toLowerCase() !== contentType) {
      return { ok: false, error: 'That file is not the type it claims to be. Please pick it again.' };
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) {
      return { ok: false, error: 'That file came through empty. Please pick it again.' };
    }
    if (buffer.length > MAX_BYTES) {
      const mb = (buffer.length / (1024 * 1024)).toFixed(1);
      return { ok: false, error: `That file is ${mb} MB. The limit is 8 MB — please use a smaller one.` };
    }

    await bucket().file(path).save(buffer, { contentType });
    await logAction(
      user, 'file.upload', 'file', path,
      `${contentType} · ${Math.round(buffer.length / 1024)} KB`,
    );
    return { path };
  });
}
