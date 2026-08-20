import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import { findBookingByLookupHash, hashToken, getInvoice, getSettings } from '@sunnclean/shared';
import { money, durationLabel } from '@/components/Money';
import { BookingActions } from '@/components/BookingActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your Booking', robots: { index: false, follow: false } };

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting confirmation', confirmed: 'Confirmed', completed: 'Completed',
  cancelled: 'Cancelled', no_show: 'Missed',
};

export default async function BookingLookup({ params }: { params: { token: string } }) {
  const booking = await findBookingByLookupHash(hashToken(params.token));
  if (!booking) notFound();

  const settings = await getSettings();
  const tz = booking.schedule.timezone || settings.business.timezone;
  const start = DateTime.fromMillis(booking.schedule.serviceStart, { zone: tz });
  const end = DateTime.fromMillis(booking.schedule.serviceEnd, { zone: tz });
  const invoice = booking.invoiceId ? await getInvoice(booking.invoiceId) : null;

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow">Booking {booking.bookingNumber}</p>
        <h1 style={{ margin: '8px 0 6px' }}>
          {booking.customer.businessName || booking.customer.contactName}
        </h1>
        <p style={{ color: 'var(--slate)' }}>
          {booking.service.serviceName} · {STATUS_LABEL[booking.status] ?? booking.status}
        </p>

        <div className="confbox">
          <div className="confrow"><span>Date</span><b>{start.toFormat('cccc, LLLL d, yyyy')}</b></div>
          <div className="confrow"><span>Time</span><b>{start.toFormat('HH:mm')} – {end.toFormat('HH:mm')}</b></div>
          <div className="confrow"><span>Estimated length</span>
            <b>{durationLabel(booking.schedule.estimatedDurationMinutes)}</b></div>
          <div className="confrow"><span>Address</span><b>
            {booking.site.address1}{booking.site.address2 ? <><br />{booking.site.address2}</> : null}
            <br />{booking.site.city}, {booking.site.state} {booking.site.zip}
          </b></div>
          <div className="confrow"><span>Square footage</span>
            <b>{booking.property.squareFeet.toLocaleString()} sq ft</b></div>
        </div>

        <h2 style={{ margin: '30px 0 14px', fontSize: '1.2rem' }}>Your estimate</h2>
        <div className="card">
          {booking.pricing.lineItems
            .filter((l) => l.amount !== 0 || l.type !== 'modifier')
            .map((l, i) => (
              <div className="pline" key={i}><span>{l.label}</span><b>{money(l.amount)}</b></div>
            ))}
          <div className="pline" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 11 }}>
            <span>Subtotal</span><b>{money(booking.pricing.subtotal)}</b>
          </div>
          <div className="pline">
            <span>{settings.invoicing.taxLabel}</span><b>{money(booking.pricing.taxAmount)}</b>
          </div>
          <div className="ptot"><span>Total</span><b>{money(booking.pricing.finalTotal)}</b></div>
          {booking.pricing.finalTotal !== booking.pricing.estimateTotal && (
            <p className="hint" style={{ marginTop: 10 }}>
              Original estimate {money(booking.pricing.estimateTotal)} — adjusted after the on-site walkthrough.
            </p>
          )}
        </div>

        {invoice && (
          <>
            <h2 style={{ margin: '30px 0 14px', fontSize: '1.2rem' }}>Invoice</h2>
            <div className="card">
              <div className="confrow"><span>Invoice number</span><b>{invoice.invoiceNumber}</b></div>
              <div className="confrow"><span>Status</span><b>{invoice.status === 'paid' ? 'Paid' : 'Sent'}</b></div>
              {invoice.dueDate && (
                <div className="confrow"><span>Due</span>
                  <b>{DateTime.fromMillis(invoice.dueDate, { zone: tz }).toFormat('LLLL d, yyyy')}</b></div>
              )}
              <div className="confrow"><span>Amount</span><b>{money(invoice.amount)}</b></div>
            </div>
          </>
        )}

        {['pending', 'confirmed'].includes(booking.status) && (
          <BookingActions token={params.token} requests={booking.requests} />
        )}

        {booking.status === 'completed' && (
          <div className="note" style={{ marginTop: 26 }}>
            <b>How did we do?</b> We&apos;d really value your feedback —{' '}
            <a href="/reviews">leave a review</a>.
          </div>
        )}
      </div>
    </section>
  );
}
