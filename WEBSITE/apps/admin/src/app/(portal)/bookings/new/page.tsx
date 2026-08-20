import Link from 'next/link';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'New booking' };

export default function NewBooking() {
  return (
    <>
      <div className="phead"><div><h1>New booking</h1></div></div>
      <div className="empty">
        <h3>Book on the customer site</h3>
        <p>
          Phone bookings go through the same form your customers use, which means they get
          the same price calculation and the same double-booking protection. Open the
          booking page, fill it in on their behalf, and it lands here automatically.
        </p>
        <a className="btn btn-primary" style={{ marginTop: 18 }}
          href={process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}
          target="_blank" rel="noopener noreferrer">
          Open the booking page
        </a>
        <p style={{ marginTop: 14 }}>
          <Link href="/bookings">← Back to bookings</Link>
        </p>
      </div>
    </>
  );
}
