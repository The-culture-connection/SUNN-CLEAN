import Link from 'next/link';
import { DateTime } from 'luxon';
import { getSettings, listBookings, listCrews } from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { PayoutToggle } from '@/components/PayoutToggle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payouts' };

const WEEKS_BACK = 6;

export default async function Payouts({ searchParams }: { searchParams: { week?: string } }) {
  await requireUser();
  const [settings, crews] = await Promise.all([getSettings(), listCrews(false)]);
  const tz = settings.business.timezone;

  const thisWeek = DateTime.now().setZone(tz).startOf('week');
  const selected = searchParams.week
    ? DateTime.fromISO(searchParams.week, { zone: tz }).startOf('week')
    : thisWeek;

  const rangeStart = thisWeek.minus({ weeks: WEEKS_BACK - 1 });
  const all = await listBookings({
    status: ['completed'],
    from: rangeStart.toMillis(),
    to: thisWeek.endOf('week').toMillis(),
    limit: 500,
  });

  const inWeek = (start: DateTime) => all.filter((b) => {
    const t = b.schedule.serviceStart;
    return t >= start.toMillis() && t <= start.endOf('week').toMillis();
  });

  const weekBookings = inWeek(selected);
  const revenue = weekBookings.reduce((s, b) => s + (b.pricing?.finalTotal ?? 0), 0);
  const payoutOf = (b: typeof all[number]) => b.payout?.overrideAmount ?? b.payout?.computedAmount ?? 0;
  const payout = weekBookings.reduce((s, b) => s + payoutOf(b), 0);
  const unpaid = weekBookings.filter((b) => !b.payout?.paid).reduce((s, b) => s + payoutOf(b), 0);
  const margin = revenue > 0 ? ((revenue - payout) / revenue) * 100 : 0;

  const byCrew = crews.map((c) => {
    const jobs = weekBookings.filter((b) => b.schedule.crewId === c.id);
    return {
      crew: c,
      jobs,
      hours: jobs.reduce((s, b) => s + (b.completion?.actualLaborHours ?? 0), 0),
      amount: jobs.reduce((s, b) => s + payoutOf(b), 0),
      allPaid: jobs.length > 0 && jobs.every((b) => b.payout?.paid),
    };
  }).filter((r) => r.jobs.length > 0);

  const history = Array.from({ length: WEEKS_BACK }, (_, i) => {
    const start = thisWeek.minus({ weeks: i });
    const list = inWeek(start);
    const rev = list.reduce((s, b) => s + (b.pricing?.finalTotal ?? 0), 0);
    const pay = list.reduce((s, b) => s + payoutOf(b), 0);
    return { start, rev, pay, kept: rev - pay, pct: rev > 0 ? ((rev - pay) / rev) * 100 : 0 };
  });

  const noRates = crews.some((c) => (c.hourlyCostPerCleaner ?? 0) === 0);

  return (
    <>
      <div className="phead">
        <div>
          <h1>Payouts</h1>
          <p>What you owe your crews. Tracked here — you pay them however you already do.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {history.map((h) => (
            <Link key={h.start.toISODate()} className="btn btn-ghost btn-sm"
              href={`/payouts?week=${h.start.toISODate()}`}
              style={h.start.hasSame(selected, 'day')
                ? { background: 'var(--navy)', color: '#fff', borderColor: 'var(--navy)' } : undefined}>
              {h.start.toFormat('LLL d')}
            </Link>
          ))}
        </div>
      </div>

      {noRates && (
        <div className="warn">
          <b>Some crews have no hourly cost set.</b> Payout figures will read zero until you
          add a rate on the <Link href="/crews">Crews</Link> page.
        </div>
      )}

      <div className="g4" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="k">Revenue this period</div>
          <div className="v">{money(revenue)}</div>
          <div className="s">{weekBookings.length} job(s) completed</div>
        </div>
        <div className="kpi">
          <div className="k">Crew payout</div>
          <div className="v">{money(payout)}</div>
          <div className="s">
            {byCrew.reduce((s, r) => s + r.hours, 0).toFixed(1)} cleaner-hours
          </div>
        </div>
        <div className="kpi">
          <div className="k">Gross margin</div>
          <div className="v">{revenue > 0 ? `${margin.toFixed(1)}%` : '—'}</div>
          <div className="s">after crew cost</div>
        </div>
        <div className="kpi">
          <div className="k">Unpaid to crews</div>
          <div className="v">{money(unpaid)}</div>
          <div className="s">
            {byCrew.filter((r) => !r.allPaid).length} of {byCrew.length} crew(s) pending
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="acard">
          <div className="ch"><h3>By crew — week of {selected.toFormat('LLL d')}</h3></div>
          <div className="cb flush">
            {byCrew.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', color: 'var(--slate)' }}>
                No completed jobs in this week.
              </div>
            ) : (
              <table>
                <thead><tr>
                  <th>Crew</th><th className="num">Jobs</th><th className="num">Hours</th>
                  <th className="num">Payout</th><th>Paid</th>
                </tr></thead>
                <tbody>
                  {byCrew.map((r) => (
                    <tr key={r.crew.id}>
                      <td>
                        <span style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                          marginRight: 7, background: r.crew.color,
                        }} />
                        <b style={{ color: 'var(--navy)' }}>{r.crew.name}</b><br />
                        <span style={{ fontSize: '.76rem', color: 'var(--slate)' }}>
                          {r.crew.headcount} cleaner(s) · {money(r.crew.hourlyCostPerCleaner)}/hr
                        </span>
                      </td>
                      <td className="num">{r.jobs.length}</td>
                      <td className="num">{r.hours.toFixed(1)}</td>
                      <td className="num"><b>{money(r.amount)}</b></td>
                      <td>
                        <PayoutToggle
                          bookingIds={r.jobs.map((b) => b.id)}
                          paid={r.allPaid}
                          label={`Mark ${r.crew.name} paid`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="acard">
          <div className="ch">
            <h3>Revenue vs payout</h3>
            <span className="chip c-info">Last {WEEKS_BACK} weeks</span>
          </div>
          <div className="cb">
            <div className="mlegend">
              <span><i style={{ background: 'var(--blue-dark)' }} />Revenue kept</span>
              <span><i style={{ background: 'var(--yellow-dark)' }} />Crew payout</span>
            </div>
            {history.every((h) => h.rev === 0) ? (
              <p style={{ color: 'var(--slate)', fontSize: '.88rem' }}>
                No completed jobs yet. This chart fills in as you finish work.
              </p>
            ) : history.map((h) => (
              <div className="mrow" key={h.start.toISODate()}>
                <span style={{ color: 'var(--slate)', fontWeight: 600 }}>{h.start.toFormat('LLL d')}</span>
                <div className="mbar">
                  <i style={{ width: `${h.rev ? (h.kept / h.rev) * 100 : 0}%`, background: 'var(--blue-dark)' }} />
                  <i style={{ width: `${h.rev ? (h.pay / h.rev) * 100 : 0}%`, background: 'var(--yellow-dark)' }} />
                </div>
                <span className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                  {h.rev ? `${h.pct.toFixed(0)}% · ${money(h.rev)}` : '—'}
                </span>
              </div>
            ))}
            <p style={{ fontSize: '.76rem', color: 'var(--slate)', marginTop: 12 }}>
              If margin drifts below your target, your rate table or your duration estimates
              need tuning — this is the number that tells you which.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
