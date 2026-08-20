import { listReviews, signedUrl, type Review } from '@sunnclean/shared';
import { ReviewModeration, type ReviewCard } from '@/components/ReviewModeration';

export const dynamic = 'force-dynamic';

/** Formatted here so the server HTML and the hydrated markup agree. */
function when(ms: number | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

async function preview(path: string): Promise<string> {
  try {
    return await signedUrl(path, 60);
  } catch {
    return '';
  }
}

export default async function ReviewsPage() {
  const reviews = await listReviews();

  // Repeat submitters are easier to spot when the count travels with the card.
  const ipCounts = new Map<string, number>();
  for (const r of reviews) {
    if (!r.ipHash) continue;
    ipCounts.set(r.ipHash, (ipCounts.get(r.ipHash) ?? 0) + 1);
  }

  async function toCard(review: Review): Promise<ReviewCard> {
    const urls = await Promise.all((review.photoPaths ?? []).map(preview));
    return {
      review,
      photoUrls: urls.filter(Boolean),
      submittedLabel: when(review.submittedAt),
      respondedLabel: when(review.ownerResponse?.at),
      sameIpCount: review.ipHash ? ipCounts.get(review.ipHash) ?? 1 : 1,
    };
  }

  const cards = await Promise.all(reviews.map(toCard));

  return (
    <ReviewModeration
      pending={cards.filter((c) => c.review.status === 'pending')}
      approved={cards.filter((c) => c.review.status === 'approved')}
      rejected={cards.filter((c) => c.review.status === 'rejected')}
    />
  );
}
