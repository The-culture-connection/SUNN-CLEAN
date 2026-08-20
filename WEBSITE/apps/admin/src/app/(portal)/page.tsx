import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  getSettings, listBookings, listCrews, listInvoices, listNotifications, listServices,
} from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { MarkAllRead } from '@/components/MarkAllRead';

export const dynamic = 'force-dynamic';

const ICONS: Record<string, [string, string, string]> = {
  invoice_needed: ['💵', 'var(--warn-bg)', 'var(--warn)'],
  new_booking: ['🆕', 'var(--good-bg)', 'var(--good)'],
  job_needs_completion: ['⏰', 'var(--warn-bg)', 'var(--warn)'],
  invoice_overdue: ['⚠', 'var(--bad-bg)', 'var(--bad)'],
  review_pending: ['★', 'var(--blue-pale)', 'var(--blue-dark)'],
  reschedule_requested: ['📅', 'var(--blue-pale)', 'var(--blue-dark)'],
  cancellation_requested: ['✕', 'var(--bad-bg)', 'var(--bad)'],
  certification_expiring: ['🛡️', 'var(--warn-bg)', 'var(--warn)'],
  contact_form: ['✉', 'var(--bg)', 'var(--slate)'],
  recurring_lead: ['🔁', 'var(--bg)', 'var(--slate)'],
};

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function Dashboard() {
  const user = await requireUser();
  const [settings, crews, notifications, invoices, services] = await Promise.all([
    getSettings(), listCrews(false), listNotifications(40), listInvoices(300), listServices(false),
  ]);
  const tz = settings.business.timezone;
  const now = DateTime.now().setZone(tz);

  const weekStart = now.startOf('week').toMillis();
  const weekEnd = now.endOf('week').toMillis();
  const [weekBookings, todayBookings] = await Promise.all([
    listBookings({ from: weekStart, to: weekEnd, limit: 300 }),
    listBookings({ from: now.startOf('day').toMillis(), to: now.endOf('day').toMillis(), limit: 60 }),
  ]);

  const live = weekBookings.filter((b) => b.status !== 'cancelled');
  const bookedThisWeek = live.reduce((s, b) => s + (b.pricing?.finalTotal ?? 0), 0);
  const completed = live.filter((b) => b.status === 'completed').length;
  const unpaid = invoices.filter((i) => i.status === 'sent');
  const outstanding = unpaid.reduce((s, i) => s + i.amount, 0);
  const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < Date.now());
  const avgValue = live.length ? bookedThisWeek / live.length : 0;

  const needsSetup = services.length === 0 || crews.length === 0;

  return (
    <>
      <div className="phead">
        <div>
          <h1>Good {now.hour < 12 ? 'morning' : now.hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0] || 'there'}</h1>
          <p>
            {todayBookings.filter((b) => b.status !== 'cancelled').length} job(s) today ·{' '}
            {crews.filter((c) => c.active).length} active crew(s) ·{' '}
            {notifications.filter((n) => !n.read).length} thing(s) need your attention
          </p>
        </div>
        <Link className="btn btn-primary" href="/schedule">Open schedule</Link>
      </div>

      {needsSetup && (
        <div className="warn" style={{ marginBottom: 18 }}>
          <b>Finish setting up before customers can book.</b>{' '}
          {services.length === 0 && <>You haven&apos;t added any <Link href="/catalog">services and prices</Link> yet. </>}
          {crews.length === 0 && <>You haven&apos;t added a <Link href="/crews">crew</Link> yet. </>}
          Until both exist, the booking page will tell visitors to call you instead.
        </div>
      )}

      <div className="g4" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="k">Booked this week</div>
          <div className="v">{money(bookedThisWeek)}</div>
          <div className="s">{live.length} job(s)</div>
        </div>
        <div className="kpi">
          <div className="k">Completed this week</div>
          <div className="v">{completed}</div>
          <div className="s">{live.length - completed} still upcoming</div>
        </div>
        <div className="kpi">
          <div className="k">Outstanding invoices</div>
          <div className="v">{money(outstanding)}</div>
          <div className="s">
            {overdue.length > 0
              ? <b style={{ color: 'var(--bad)' }}>{overdue.length} overdue</b>
              : `${unpaid.length} unpaid`}
          </div>
        </div>
        <div className="kpi">
          <div className="k">Average job value</div>
          <div className="v">{money(avgValue)}</div>
          <div className="s">this week</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.15fr .85fr', gap: 16 }}>
        <div className="acard">
          <div className="ch">
            <h3>Action needed</h3>
            <MarkAllRead />
          </div>
          <div className="cb flush feed">
            {notifications.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
                Nothing needs your attention right now.
              </div>
            ) : notifications.map((n) => {
              const [icon, bg, fg] = ICONS[n.type] ?? ['•', 'var(--bg)', 'var(--slate)'];
              return (
                <Link key={n.id} href={n.link || '/'} className={`nrow ${n.read ? '' : 'unread'}`}>
                  <span className="ni" style={{ background: bg, color: fg }} aria-hidden>{icon}</span>
                  <span className="nt"><b>{n.title}</b><span>{n.body}</span></span>
                  <span className="nw">{ago(n.createdAt)}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="acard">
          <div className="ch">
            <h3>Today</h3>
            <span className="chip c-info">{now.toFormat('ccc LLL d')}</span>
          </div>
          <div className="cb flush">
            {todayBookings.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--slate)' }}>
                Nothing scheduled today.
              </div>
            ) : (
              <table><tbody>
                {todayBookings.map((b) => {
                  const crew = crews.find((c) => c.id === b.schedule.crewId);
                  const s = DateTime.fromMillis(b.schedule.serviceStart, { zone: tz });
                  const e = DateTime.fromMillis(b.schedule.serviceEnd, { zone: tz });
                  return (
                    <tr key={b.id}>
                      <td style={{ width: 8, paddingRight: 0 }}>
                        <span style={{
                          display: 'block', width: 4, height: 32, borderRadius: 2,
                          background: crew?.color ?? 'var(--line)',
                        }} />
                      </td>
                      <td>
                        <Link href={`/bookings/${b.id}`}>
                          <b style={{ color: 'var(--navy)' }}>
                            {b.customer.businessName || b.customer.contactName}
                          </b>
                        </Link>
                        <br />
                        <span style={{ color: 'var(--slate)', fontSize: '.79rem' }}>
                          {crew?.name ?? 'Unassigned'} · {s.toFormat('HH:mm')}–{e.toFormat('HH:mm')}
                        </span>
                      </td>
                      <td className="num">
                        <span className={`chip ${
                          b.status === 'completed' ? 'c-good'
                            : b.status === 'cancelled' ? 'c-bad'
                            : b.status === 'pending' ? 'c-warn' : 'c-info'}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody></table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
