import Link from 'next/link';
import { DateTime } from 'luxon';
import { getSettings, listBookings, listCrews } from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bookings' };

const CHIP: Record<string, string> = {
  pending: 'c-warn', confirmed: 'c-info', completed: 'c-good',
  cancelled: 'c-bad', no_show: 'c-bad',
};

export default async function Bookings({ searchParams }: { searchParams: { status?: string } }) {
  await requireUser();
  const [settings, crews] = await Promise.all([getSettings(), listCrews(false)]);
  const tz = settings.business.timezone;
  const status = searchParams.status;
  const bookings = await listBookings({
    status: status ? [status] : undefined, limit: 300,
  });

  return (
    <>
      <div className="phead">
        <div><h1>Bookings</h1><p>{bookings.length} shown</p></div>
        <Link className="btn btn-primary" href="/bookings/new">+ New booking</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'],
          ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([v, label]) => (
          <Link key={label} href={v ? `/bookings?status=${v}` : '/bookings'}
            className="btn btn-ghost btn-sm"
            style={status === v || (!status && !v)
              ? { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' } : undefined}>
            {label}
          </Link>
        ))}
      </div>

      <div className="acard">
        <div className="cb flush" style={{ overflowX: 'auto' }}>
          {bookings.length === 0 ? (
            <div style={{ padding: 44, textAlign: 'center', color: 'var(--slate)' }}>
              No bookings yet. They&apos;ll appear here as soon as customers start booking.
            </div>
          ) : (
            <table>
              <thead><tr>
                <th>Booking</th><th>Customer</th><th>Service</th><th>Date &amp; time</th>
                <th>Crew</th><th>Status</th><th className="num">Total</th><th />
              </tr></thead>
              <tbody>
                {bookings.map((b) => {
                  const crew = crews.find((c) => c.id === b.schedule.crewId);
                  const s = DateTime.fromMillis(b.schedule.serviceStart, { zone: tz });
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700, color: 'var(--blue-dark)' }}>{b.bookingNumber}</td>
                      <td><b style={{ color: 'var(--navy)' }}>
                        {b.customer.businessName || b.customer.contactName}</b></td>
                      <td>{b.service.serviceName}</td>
                      <td className="num" style={{ textAlign: 'left' }}>{s.toFormat('LLL d · HH:mm')}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', width: 9, height: 9, borderRadius: 3,
                          marginRight: 6, background: crew?.color ?? 'var(--line)',
                        }} />{crew?.name ?? '—'}
                      </td>
                      <td><span className={`chip ${CHIP[b.status] ?? 'c-mute'}`}>{b.status}</span></td>
                      <td className="num"><b>{money(b.pricing?.finalTotal ?? 0)}</b></td>
                      <td className="num">
                        <Link className="btn btn-ghost btn-sm" href={`/bookings/${b.id}`}>Open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
