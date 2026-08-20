import { notFound } from 'next/navigation';
import { findBookingByReviewHash, hashToken, listServices } from '@sunnclean/shared';
import { ReviewForm } from '@/components/ReviewForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leave a Review', robots: { index: false, follow: false } };

export default async function InvitedReview({ params }: { params: { token: string } }) {
  const booking = await findBookingByReviewHash(hashToken(params.token));
  if (!booking) notFound();
  const services = await listServices(false);

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 680 }}>
        <p className="eyebrow">Booking {booking.bookingNumber}</p>
        <h1 style={{ margin: '8px 0 12px' }}>How did we do?</h1>
        <p className="lede" style={{ marginBottom: 24 }}>
          Thanks for having us out for your {booking.service.serviceName.toLowerCase()}.
          Your review will carry a <b>Verified Customer</b> badge.
        </p>
        <ReviewForm services={services} token={params.token} />
      </div>
    </section>
  );
}
