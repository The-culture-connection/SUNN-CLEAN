import { z } from 'zod';
import {
  bucket, deleteCertification, listCertifications, saveCertification,
  type Certification,
} from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Credentials shown on the public trust page.
 *
 * Expiry dates are stored as plain "yyyy-mm-dd" strings and compared as strings,
 * which is exactly what listCertifications(true) does when it hides an expired
 * credential from the website. No time zone maths, no drift.
 */

const CATEGORIES = ['insurance', 'safety', 'industry', 'environmental', 'personnel'] as const;

/** An empty string means "not recorded"; anything else must be a real ISO date. */
const DateStr = z.string().trim().max(10).refine(
  (v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
  'Dates need to look like 2026-09-14.',
).default('');

const CertSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Give this certification a name.').max(140),
  issuer: z.string().trim().max(140).default(''),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: 'Pick a category for this certification.' }),
  }),
  credentialId: z.string().trim().max(140).default(''),
  description: z.string().trim().max(2000).default(''),
  issueDate: DateStr,
  expiryDate: DateStr,
  badgeImagePath: z.string().max(300).default(''),
  documentPath: z.string().max(300).default(''),
  published: z.boolean(),
  order: z.coerce.number().int().min(0).max(9999),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check the details and try again.';
}

function pathOk(path: string): boolean {
  return path === '' || (path.startsWith('public/certifications/') && !path.includes('..'));
}

async function removeFile(path: string) {
  if (!path) return;
  try {
    await bucket().file(path).delete();
  } catch {
    // Already gone. Not worth failing the delete over.
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = CertSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const d = parsed.data;

    if (!pathOk(d.badgeImagePath) || !pathOk(d.documentPath)) {
      return { ok: false, error: 'Those file locations are not valid.' };
    }
    if (d.issueDate && d.expiryDate && d.expiryDate < d.issueDate) {
      return { ok: false, error: 'The expiry date falls before the issue date. Check both.' };
    }

    const existing = d.id
      ? (await listCertifications(false)).find((c) => c.id === d.id) ?? null
      : null;
    if (d.id && !existing) return { ok: false, error: 'That certification has already been removed.' };

    const patch: Partial<Certification> & { id?: string } = {
      id: d.id,
      name: d.name,
      issuer: d.issuer,
      category: d.category,
      credentialId: d.credentialId,
      description: d.description,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      badgeImagePath: d.badgeImagePath,
      documentPath: d.documentPath,
      published: d.published,
      order: d.order,
    };

    const id = await saveCertification(patch);
    await logAction(
      user, existing ? 'certification.update' : 'certification.create', 'certification', id,
      `${d.name}${d.expiryDate ? ` · expires ${d.expiryDate}` : ''}`,
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

    const existing = (await listCertifications(false)).find((c) => c.id === parsed.data.id);
    if (!existing) return { ok: false, error: 'That certification has already been removed.' };

    await removeFile(existing.badgeImagePath ?? '');
    await removeFile(existing.documentPath ?? '');
    await deleteCertification(parsed.data.id);

    await logAction(user, 'certification.delete', 'certification', parsed.data.id, existing.name);
    return { id: parsed.data.id };
  });
}
