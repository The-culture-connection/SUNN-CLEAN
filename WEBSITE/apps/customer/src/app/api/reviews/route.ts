import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  bucket, emailHasCompletedBooking, findBookingByReviewHash, hashIp, hashToken,
  listServices, notify, saveReview,
} from '@sunnclean/shared';
import { bad, clientIp, rateLimit } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(140).default(''),
  body: z.string().min(40).max(4000),
  displayName: z.string().max(120).default(''),
  displayNameMode: z.enum(['business', 'first_name', 'anonymous']).default('business'),
  businessTypeLabel: z.string().max(140).default(''),
  serviceId: z.string().default(''),
  email: z.string().email().max(200).optional().or(z.literal('')),
  token: z.string().max(120).optional(),
  photos: z.array(z.string().startsWith('data:image/')).max(4).default([]),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`review:${ip}`, 2, 24 * 3600_000)) {
    return bad('You have already submitted a review recently.', 429);
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('Please complete the review form.', 400);
  const d = parsed.data;

  // Verified when the token matches a completed job, or the email does.
  let bookingId: string | undefined;
  let verified = false;
  if (d.token) {
    const b = await findBookingByReviewHash(hashToken(d.token));
    if (b && b.status === 'completed') { bookingId = b.id; verified = true; }
  }
  if (!verified && d.email) {
    const match = await emailHasCompletedBooking(d.email);
    if (match) { bookingId = match; verified = true; }
  }

  const services = await listServices(false);
  const service = services.find((s) => s.id === d.serviceId);

  const reviewId = await saveReview({
    bookingId,
    rating: d.rating as 1 | 2 | 3 | 4 | 5,
    title: d.title.trim(),
    body: d.body.trim(),
    displayName: d.displayNameMode === 'anonymous' ? 'Anonymous' : (d.displayName.trim() || 'Customer'),
    displayNameMode: d.displayNameMode,
    businessTypeLabel: d.businessTypeLabel.trim(),
    serviceId: d.serviceId,
    serviceName: service?.name ?? '',
    email: (d.email ?? '').toLowerCase().trim(),
    verified,
    photoPaths: [],
    status: 'pending',   // nothing is public until a human approves it
    featured: false,
    ipHash: hashIp(ip),
    submittedAt: Date.now(),
  });

  // Photos land in quarantine and only move to public/ on approval.
  const paths: string[] = [];
  for (let i = 0; i < d.photos.length; i++) {
    try {
      const [, meta, b64] = d.photos[i].match(/^data:(image\/\w+);base64,(.+)$/) ?? [];
      if (!b64) continue;
      const ext = meta.split('/')[1].replace('jpeg', 'jpg');
      const path = `quarantine/reviews/${reviewId}/${i}.${ext}`;
      await bucket().file(path).save(Buffer.from(b64, 'base64'), { contentType: meta });
      paths.push(path);
    } catch { /* a failed photo must not lose the review text */ }
  }
  if (paths.length) await saveReview({ id: reviewId, photoPaths: paths });

  await notify({
    id: `review_${reviewId}`,
    type: 'review_pending',
    severity: 'info',
    title: `New ${d.rating}-star review awaiting moderation`,
    body: `${verified ? 'Verified customer' : 'Unverified'} · ${d.title || d.body.slice(0, 60)}`,
    link: '/reviews',
    relatedId: reviewId,
  });

  return NextResponse.json({ ok: true, verified });
}
