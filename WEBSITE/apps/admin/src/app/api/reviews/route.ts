import { z } from 'zod';
import {
  bucket, deleteNotificationsFor, deleteReview, listReviews, saveReview,
  type Review,
} from '@sunnclean/shared';
import { guard, fail, logAction } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Review moderation.
 *
 * Customer-submitted photos land in `quarantine/` and stay there. They only
 * become readable by the public website when a human approves the review, at
 * which point they are MOVED — not copied — into `public/reviews/`. Rejecting a
 * review deletes them outright, so nothing unvetted lingers in the bucket.
 */

const ActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['approve', 'approve_feature', 'reject', 'reply']),
  reason: z.string().trim().max(1000).default(''),
  response: z.string().trim().max(4000).default(''),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check the details and try again.';
}

async function findReview(id: string): Promise<Review | null> {
  return (await listReviews()).find((r) => r.id === id) ?? null;
}

/** Move quarantined photos into the public prefix, keeping their order. */
async function publishPhotos(reviewId: string, paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const from = paths[i];
    if (!from.startsWith('quarantine/')) { out.push(from); continue; }
    const ext = (from.split('.').pop() ?? 'jpg').toLowerCase();
    const to = `public/reviews/${reviewId}/${i}.${ext}`;
    try {
      await bucket().file(from).move(to);
      out.push(to);
    } catch {
      // A photo that will not move must not block the review going live.
    }
  }
  return out;
}

async function discardPhotos(paths: string[]) {
  for (const path of paths) {
    if (!path.startsWith('quarantine/')) continue;
    try {
      await bucket().file(path).delete();
    } catch {
      // Already gone.
    }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail('Invalid request');
  return guard(async (user) => {
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { id, action, reason, response } = parsed.data;

    const review = await findReview(id);
    if (!review) return { ok: false, error: 'That review has already been removed.' };
    const photoPaths = review.photoPaths ?? [];

    if (action === 'reply') {
      if (!response) return { ok: false, error: 'Write your reply before saving it.' };
      await saveReview({
        id,
        ownerResponse: { body: response, at: Date.now(), byUid: user.uid },
      });
      await logAction(user, 'review.reply', 'review', id, response.slice(0, 120));
      return { id };
    }

    if (action === 'reject') {
      if (!reason) {
        return { ok: false, error: 'Add a short reason so you remember why this one was turned down.' };
      }
      await discardPhotos(photoPaths);
      await saveReview({
        id,
        status: 'rejected',
        featured: false,
        photoPaths: [],
        moderation: { byUid: user.uid, at: Date.now(), reason },
      });
      await deleteNotificationsFor(id, 'review_pending');
      await logAction(user, 'review.reject', 'review', id, reason);
      return { id };
    }

    // approve / approve_feature
    const published = await publishPhotos(id, photoPaths);
    await saveReview({
      id,
      status: 'approved',
      featured: action === 'approve_feature',
      photoPaths: published,
      moderation: { byUid: user.uid, at: Date.now(), reason },
    });
    await deleteNotificationsFor(id, 'review_pending');
    await logAction(
      user, action === 'approve_feature' ? 'review.feature' : 'review.approve', 'review', id,
      `${review.rating}★ ${review.displayName}`,
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

    const review = await findReview(parsed.data.id);
    if (!review) return { ok: false, error: 'That review has already been removed.' };

    for (const path of review.photoPaths ?? []) {
      try {
        await bucket().file(path).delete();
      } catch {
        // Already gone.
      }
    }
    await deleteNotificationsFor(parsed.data.id, 'review_pending');
    await deleteReview(parsed.data.id);

    await logAction(
      user, 'review.delete', 'review', parsed.data.id,
      `${review.rating}★ ${review.displayName}`,
    );
    return { id: parsed.data.id };
  });
}
