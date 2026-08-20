import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import {
  getBooking, getCrew, getInvoice, getSettings, listAudit, listCrews, signedUrl,
} from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';
import { money, durationLabel } from '@/lib/format';
import { JobActions } from '@/components/JobActions';
import { InvoicePanel } from '@/components/InvoicePanel';
import { PriceBreakdown } from '@/components/PriceBreakdown';

export const dynamic = 'force-dynamic';

export default async function BookingDetail({ params }: { params: { id: string } }) {
  await requireUser();
  const booking = await getBooking(params.id);
  if (!booking) notFound();

  const [settings, crews, crew, invoice, audit] = await Promise.all([
    getSettings(),
    listCrews(false),
    getCrew(booking.schedule.crewId),
    booking.invoiceId ? getInvoice(booking.invoiceId) : Promise.resolve(null),
    listAudit(booking.id, 20),
  ]);

  const tz = booking.schedule.timezone || settings.business.timezone;
  const start = DateTime.fromMillis(booking.schedule.serviceStart, { zone: tz });
  const end = DateTime.fromMillis(booking.schedule.serviceEnd, { zone: tz });
  const buffer = booking.schedule.travelBufferMinutes ?? settings.scheduling.travelBufferMinutes;

  const photoUrls = await Promise.all(
    (booking.completion?.photoPaths ?? []).map((p) => signedUrl(p, 60).catch(() => '')),
  );

  const done = booking.status === 'completed';
  const invoiced = !!invoice && invoice.status !== 'draft';
  const paid = invoice?.status === 'paid';

  const actualHours = booking.completion?.actualLaborHours ?? 0;
  const headcount = crew?.headcount ?? booking.schedule.quotingHeadcountAtBooking ?? 1;
  const payout = booking.payout?.overrideAmount ?? booking.payout?.computedAmount ?? 0;
  const margin = booking.pricing.finalTotal > 0
    ? ((booking.pricing.finalTotal - payout) / booking.pricing.finalTotal) * 100 : 0;

  return (
    <>
      <div className="phead">
        <div>
          <div style={{ fontSize: '.75rem', color: 'var(--slate)', fontWeight: 700, letterSpacing: '.06em' }}>
            BOOKING {booking.bookingNumber}
          </div>
          <h1 style={{ marginTop: 2 }}>
            {booking.customer.businessName || booking.customer.contactName}
          </h1>
          <p>
            {booking.service.serviceName} · {booking.property.squareFeet.toLocaleString()} sq ft
            {booking.property.propertyTypeName ? ` · ${booking.property.propertyTypeName}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`chip ${
            booking.status === 'completed' ? 'c-good'
              : booking.status === 'cancelled' ? 'c-bad'
              : booking.status === 'pending' ? 'c-warn' : 'c-info'}`}>
            {booking.status}
          </span>
          {done && !invoice && <span className="chip c-warn">Invoice needed</span>}
          {paid && <span className="chip c-good">Paid</span>}
        </div>
      </div>

      {(booking.requests?.cancellationRequested || booking.requests?.rescheduleRequested) && (
        <div className="warn">
          <b>
            The customer requested {booking.requests.cancellationRequested ? 'a cancellation' : 'a reschedule'}.
          </b>{' '}
          {booking.requests.requestNote || 'No note provided.'}
        </div>
      )}

      {done && !invoice && (
        <div className="warn">
          <b>This job is done and hasn&apos;t been invoiced.</b>{' '}
          Generate the invoice below, send it from your own inbox, then mark it sent.
        </div>
      )}

      <div className="steps4">
        <div className="st4 done">✓ Booked</div>
        <div className={`st4 ${done ? 'done' : 'now'}`}>{done ? '✓ Completed' : '2 · Complete'}</div>
        <div className={`st4 ${invoiced ? 'done' : done ? 'now' : ''}`}>{invoiced ? '✓ Invoiced' : '3 · Invoice'}</div>
        <div className={`st4 ${paid ? 'done' : invoiced ? 'now' : ''}`}>{paid ? '✓ Paid' : '4 · Paid'}</div>
      </div>

      <div className="dgrid">
        {/* ---------------- left column ---------------- */}
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="acard">
            <div className="ch"><h3>Customer &amp; site</h3></div>
            <div className="cb">
              {booking.customer.businessName && (
                <div className="drow"><span>Business</span><b>{booking.customer.businessName}</b></div>)}
              <div className="drow"><span>Contact</span><b>{booking.customer.contactName}</b></div>
              <div className="drow"><span>Email</span>
                <b><a href={`mailto:${booking.customer.email}`}>{booking.customer.email}</a></b></div>
              <div className="drow"><span>Phone</span>
                <b><a href={`tel:${booking.customer.phone.replace(/[^\d+]/g, '')}`}>{booking.customer.phone}</a></b></div>
              <div className="drow"><span>Address</span><b>
                {booking.site.address1}{booking.site.address2 ? <><br />{booking.site.address2}</> : null}
                <br />{booking.site.city}, {booking.site.state} {booking.site.zip}
              </b></div>
              {booking.service.customerNotes && (
                <div className="drow"><span>Customer notes</span>
                  <b style={{ fontWeight: 500, maxWidth: '60%' }}>{booking.service.customerNotes}</b></div>)}
              {booking.site.accessNotes && (
                <div className="secure">
                  <b>🔒 Access instructions — crew only</b>
                  {booking.site.accessNotes}
                </div>
              )}
            </div>
          </div>

          <div className="acard">
            <div className="ch"><h3>Schedule</h3></div>
            <div className="cb">
              <div className="drow"><span>Date</span><b>{start.toFormat('cccc, LLLL d, yyyy')}</b></div>
              <div className="drow"><span>Service window</span>
                <b>{start.toFormat('HH:mm')} – {end.toFormat('HH:mm')}</b></div>
              <div className="drow"><span>Blocked window</span><b>
                {start.minus({ minutes: buffer }).toFormat('HH:mm')} – {end.plus({ minutes: buffer }).toFormat('HH:mm')}
                <span style={{ fontWeight: 500, color: 'var(--slate)' }}> (incl. travel buffer)</span>
              </b></div>
              <div className="drow"><span>Estimated length</span>
                <b>{durationLabel(booking.schedule.estimatedDurationMinutes)}</b></div>
              {actualHours > 0 && (
                <div className="drow"><span>Actual length</span>
                  <b>{durationLabel(Math.round(actualHours * 60))}</b></div>)}
              <div className="drow"><span>Crew</span><b>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                  marginRight: 6, background: crew?.color ?? 'var(--line)',
                }} />
                {crew?.name ?? 'Unassigned'} · {headcount} cleaner{headcount === 1 ? '' : 's'}
              </b></div>
            </div>
          </div>

          <JobActions
            bookingId={booking.id}
            status={booking.status}
            crews={crews.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
            currentCrewId={booking.schedule.crewId}
            startIso={start.toFormat("yyyy-MM-dd'T'HH:mm")}
            durationMinutes={booking.schedule.estimatedDurationMinutes}
            completion={{
              crewNotes: booking.completion?.crewNotes ?? '',
              actualStart: booking.completion?.actualStart
                ? DateTime.fromMillis(booking.completion.actualStart, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm")
                : start.toFormat("yyyy-MM-dd'T'HH:mm"),
              actualEnd: booking.completion?.actualEnd
                ? DateTime.fromMillis(booking.completion.actualEnd, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm")
                : end.toFormat("yyyy-MM-dd'T'HH:mm"),
            }}
            photoUrls={photoUrls.filter(Boolean)}
            timezone={tz}
          />

          {audit.length > 0 && (
            <div className="acard">
              <div className="ch"><h3>Activity log</h3></div>
              <div className="cb" style={{ fontSize: '.8rem' }}>
                {audit.map((a) => (
                  <div className="drow" key={a.id}>
                    <span>{DateTime.fromMillis(a.createdAt, { zone: tz }).toFormat('LLL d, HH:mm')}</span>
                    <b style={{ fontWeight: 600 }}>{a.action}{a.detail ? ` — ${a.detail}` : ''} · {a.byEmail}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- right column ---------------- */}
        <div style={{ display: 'grid', gap: 16 }}>
          <PriceBreakdown
            bookingId={booking.id}
            lineItems={booking.pricing.lineItems}
            subtotal={booking.pricing.subtotal}
            taxRate={booking.pricing.taxRate}
            taxAmount={booking.pricing.taxAmount}
            finalTotal={booking.pricing.finalTotal}
            estimateTotal={booking.pricing.estimateTotal}
            taxLabel={settings.invoicing.taxLabel}
            locked={paid}
          />

          <InvoicePanel
            bookingId={booking.id}
            canGenerate={done}
            invoice={invoice ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              amount: invoice.amount,
              dueLabel: invoice.dueDate
                ? DateTime.fromMillis(invoice.dueDate, { zone: tz }).toFormat('LLLL d, yyyy') : '',
            } : null}
            customerEmail={booking.customer.email}
            customerName={booking.customer.contactName}
            serviceName={booking.service.serviceName}
            serviceDateLabel={start.toFormat('LLLL d, yyyy')}
            addressLabel={`${booking.site.address1}, ${booking.site.city}`}
            total={booking.pricing.finalTotal}
            termsLabel={settings.invoicing.paymentTermsLabel}
            remitTo={settings.invoicing.remitToInstructions}
            businessName={settings.business.legalName || settings.business.displayName}
          />

          <div className="acard">
            <div className="ch">
              <h3>Crew payout</h3>
              <span className={`chip ${booking.payout?.paid ? 'c-good' : 'c-mute'}`}>
                {booking.payout?.paid ? 'Paid' : 'Unpaid'}
              </span>
            </div>
            <div className="cb">
              {actualHours > 0 ? (
                <>
                  <div className="drow"><span>Actual labour</span><b>{actualHours.toFixed(2)} h</b></div>
                  <div className="drow"><span>Crew size</span><b>{headcount}</b></div>
                  <div className="drow"><span>Rate</span>
                    <b>{money(crew?.hourlyCostPerCleaner ?? 0)} / cleaner-hour</b></div>
                  <div className="drow"><span>Computed payout</span>
                    <b style={{ fontSize: '1.05rem' }}>{money(payout)}</b></div>
                  <div className="drow"><span>Gross margin</span>
                    <b style={{ color: margin >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                      {money(booking.pricing.finalTotal - payout)} · {margin.toFixed(1)}%
                    </b></div>
                  {(crew?.hourlyCostPerCleaner ?? 0) === 0 && (
                    <p className="hint">
                      Set an hourly cost on <Link href="/crews">this crew</Link> to see a real payout figure.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--slate)', fontSize: '.88rem' }}>
                  Payout is calculated once the job is marked complete.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
