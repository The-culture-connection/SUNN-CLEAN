import Link from 'next/link';
import { DateTime } from 'luxon';
import { getSettings, listInvoices } from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoices' };

export default async function Invoices() {
  await requireUser();
  const [settings, invoices] = await Promise.all([getSettings(), listInvoices(400)]);
  const tz = settings.business.timezone;
  const now = Date.now();

  const unpaid = invoices.filter((i) => i.status === 'sent');
  const outstanding = unpaid.reduce((s, i) => s + i.amount, 0);
  const bucketOf = (i: typeof invoices[number]) => {
    if (!i.dueDate || i.dueDate > now) return 'current';
    const days = (now - i.dueDate) / 86_400_000;
    return days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd60plus';
  };
  const buckets = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  unpaid.forEach((i) => { buckets[bucketOf(i) as keyof typeof buckets] += i.amount; });
  const max = Math.max(...Object.values(buckets), 1);

  const paidThisMonth = invoices.filter(
    (i) => i.status === 'paid' && i.paidAt &&
      DateTime.fromMillis(i.paidAt, { zone: tz }).hasSame(DateTime.now().setZone(tz), 'month'),
  );
  const avgDays = paidThisMonth.length
    ? paidThisMonth.reduce((s, i) => s + ((i.paidAt! - i.issuedAt) / 86_400_000), 0) / paidThisMonth.length
    : 0;

  const ROWS: [keyof typeof buckets, string, string][] = [
    ['current', 'Current', 'var(--good)'],
    ['d30', '1–30 days', 'var(--yellow-dark)'],
    ['d60', '31–60 days', 'var(--bad)'],
    ['d60plus', '60+ days', 'var(--bad)'],
  ];

  return (
    <>
      <div className="phead">
        <div>
          <h1>Invoices</h1>
          <p>{money(outstanding)} outstanding across {unpaid.length} unpaid invoice(s)</p>
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="acard">
          <div className="ch"><h3>Aging</h3></div>
          <div className="cb">
            {ROWS.map(([key, label, color]) => (
              <div className="aging" key={key}>
                <span className="lb">{label}</span>
                <div className="abar"><i style={{ width: `${(buckets[key] / max) * 100}%`, background: color }} /></div>
                <span className="vv">{money(buckets[key])}</span>
              </div>
            ))}
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '2px solid var(--navy)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <b style={{ color: 'var(--navy)' }}>Total outstanding</b>
              <b style={{ color: 'var(--navy)', fontSize: '1.15rem' }}>{money(outstanding)}</b>
            </div>
          </div>
        </div>

        <div className="acard">
          <div className="ch"><h3>This month</h3></div>
          <div className="cb">
            <div className="grid g2">
              <div className="kpi" style={{ border: 0, padding: 0 }}>
                <div className="k">Collected</div>
                <div className="v" style={{ fontSize: '1.5rem' }}>
                  {money(paidThisMonth.reduce((s, i) => s + i.amount, 0))}
                </div>
              </div>
              <div className="kpi" style={{ border: 0, padding: 0 }}>
                <div className="k">Invoices paid</div>
                <div className="v" style={{ fontSize: '1.5rem' }}>{paidThisMonth.length}</div>
              </div>
              <div className="kpi" style={{ border: 0, padding: 0 }}>
                <div className="k">Avg days to pay</div>
                <div className="v" style={{ fontSize: '1.5rem' }}>{avgDays ? avgDays.toFixed(0) : '—'}</div>
              </div>
              <div className="kpi" style={{ border: 0, padding: 0 }}>
                <div className="k">Awaiting send</div>
                <div className="v" style={{ fontSize: '1.5rem' }}>
                  {invoices.filter((i) => i.status === 'draft').length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="acard">
        <div className="cb flush" style={{ overflowX: 'auto' }}>
          {invoices.length === 0 ? (
            <div style={{ padding: 44, textAlign: 'center', color: 'var(--slate)' }}>
              No invoices yet. Generate one from a completed booking.
            </div>
          ) : (
            <table>
              <thead><tr>
                <th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th>
                <th>Status</th><th className="num">Amount</th><th />
              </tr></thead>
              <tbody>
                {invoices.map((i) => {
                  const overdue = i.status === 'sent' && i.dueDate && i.dueDate < now;
                  const days = overdue ? Math.floor((now - i.dueDate!) / 86_400_000) : 0;
                  return (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 700, color: 'var(--blue-dark)' }}>{i.invoiceNumber}</td>
                      <td><b style={{ color: 'var(--navy)' }}>{i.customerName}</b></td>
                      <td>{DateTime.fromMillis(i.issuedAt, { zone: tz }).toFormat('LLL d')}</td>
                      <td>{i.dueDate ? DateTime.fromMillis(i.dueDate, { zone: tz }).toFormat('LLL d') : '—'}</td>
                      <td>
                        <span className={`chip ${
                          i.status === 'paid' ? 'c-good' : overdue ? 'c-bad'
                            : i.status === 'sent' ? 'c-info' : 'c-warn'}`}>
                          {overdue ? `Overdue ${days}d` : i.status}
                        </span>
                      </td>
                      <td className="num"><b>{money(i.amount)}</b></td>
                      <td className="num">
                        <Link className="btn btn-ghost btn-sm" href={`/bookings/${i.bookingId}`}>Open</Link>
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
