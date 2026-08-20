import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  crewDayId, datesToInspect, getSettings, listBookings, listCrews, loadCrewDays,
} from '@sunnclean/shared';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Schedule' };

const PX_PER_HOUR = 44;

export default async function Schedule({
  searchParams,
}: { searchParams: { date?: string } }) {
  await requireUser();
  const settings = await getSettings();
  const tz = settings.business.timezone;
  const buffer = settings.scheduling.travelBufferMinutes;

  const date = searchParams.date ?? DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');
  const day = DateTime.fromISO(date, { zone: tz });
  const crews = (await listCrews(false)).filter((c) => c.active);

  // Read the same crew-day index the booking engine writes, so what an admin
  // sees is exactly what the availability API sees.
  const probe = datesToInspect(day.startOf('day').toMillis(), day.endOf('day').toMillis(), tz);
  const crewDays = await loadCrewDays(crews.map((c) => c.id), probe);

  const bookings = await listBookings({
    from: day.startOf('day').minus({ days: 1 }).toMillis(),
    to: day.endOf('day').plus({ days: 1 }).toMillis(),
    limit: 200,
  });
  const byId = new Map(bookings.map((b) => [b.id, b]));

  // Work out the hour window to render: the union of every crew's open hours
  // and every job on screen, padded by the buffer.
  let minMin = 24 * 60, maxMin = 0;
  for (const c of crews) {
    for (const wd of Object.values(c.hours ?? {})) {
      if (!wd?.enabled) continue;
      minMin = Math.min(minMin, wd.start);
      maxMin = Math.max(maxMin, wd.end);
    }
  }
  if (minMin > maxMin) { minMin = 7 * 60; maxMin = 19 * 60; }
  const dayStartMs = day.startOf('day').toMillis();
  for (const c of crews) {
    const cd = crewDays.get(crewDayId(c.id, date));
    for (const b of cd?.blocks ?? []) {
      minMin = Math.min(minMin, (b.start - dayStartMs) / 60000 - buffer);
      maxMin = Math.max(maxMin, (b.end - dayStartMs) / 60000 + buffer);
    }
  }
  const startHour = Math.max(0, Math.floor(minMin / 60) - 1);
  const endHour = Math.min(26, Math.ceil(maxMin / 60) + 1);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const topFor = (ms: number) => ((ms - dayStartMs) / 3_600_000 - startHour) * PX_PER_HOUR;

  const prev = day.minus({ days: 1 }).toFormat('yyyy-MM-dd');
  const next = day.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  const today = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');

  return (
    <>
      <div className="phead">
        <div>
          <h1>Schedule</h1>
          <p>
            One column per crew. Hatched bands are the {buffer}-minute travel buffer —
            nothing can be booked into them.
          </p>
        </div>
        <Link className="btn btn-primary" href="/bookings/new">+ New booking</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost btn-sm" href={`/schedule?date=${prev}`}>‹</Link>
        <b style={{ color: 'var(--navy)', minWidth: 220 }}>{day.toFormat('cccc, LLLL d, yyyy')}</b>
        <Link className="btn btn-ghost btn-sm" href={`/schedule?date=${next}`}>›</Link>
        <Link className="btn btn-ghost btn-sm" href={`/schedule?date=${today}`}>Today</Link>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: '.78rem', color: 'var(--slate)', flexWrap: 'wrap' }}>
          {crews.map((c) => (
            <span key={c.id}>
              <i style={{
                width: 11, height: 11, borderRadius: 3, display: 'inline-block',
                marginRight: 5, verticalAlign: -1, background: c.color,
              }} />{c.name}
            </span>
          ))}
          <span>
            <i style={{
              width: 11, height: 11, borderRadius: 3, display: 'inline-block',
              marginRight: 5, verticalAlign: -1,
              background: 'repeating-linear-gradient(45deg,#c8d6e0,#c8d6e0 3px,#eef4f8 3px,#eef4f8 6px)',
            }} />Travel buffer
          </span>
        </div>
      </div>

      {crews.length === 0 ? (
        <div className="empty">
          <h3>No active crews</h3>
          <p>Add a crew before anything can be scheduled.</p>
          <Link className="btn btn-primary" style={{ marginTop: 16 }} href="/crews">Add a crew</Link>
        </div>
      ) : (
        <div className="acard">
          <div className="calgridwrap" style={{ gridTemplateColumns: `58px repeat(${crews.length}, minmax(180px, 1fr))` }}>
            <div>
              <div className="colhead" />
              {hours.map((h) => (
                <div className="tslot" key={h}>{String(h % 24).padStart(2, '0')}:00</div>
              ))}
            </div>

            {crews.map((crew) => {
              const cd = crewDays.get(crewDayId(crew.id, date));
              const blocks = cd?.blocks ?? [];
              return (
                <div key={crew.id}>
                  <div className="colhead">
                    <span className="sw" style={{ background: crew.color }} />
                    {crew.name}
                    <small>{crew.headcount} cleaner{crew.headcount === 1 ? '' : 's'}</small>
                  </div>
                  <div className="crewbody" style={{ height: hours.length * PX_PER_HOUR }}>
                    {hours.map((h) => <div className="track" key={h} />)}
                    <div style={{ position: 'absolute', inset: 0 }}>
                      {blocks.map((b) => {
                        const booking = byId.get(b.bookingId);
                        const top = topFor(b.start);
                        const height = (b.end - b.start) / 3_600_000 * PX_PER_HOUR;
                        const bufPx = (buffer / 60) * PX_PER_HOUR;
                        const s = DateTime.fromMillis(b.start, { zone: tz });
                        const e = DateTime.fromMillis(b.end, { zone: tz });
                        return (
                          <div key={b.bookingId + b.start}>
                            <div className="buffer" style={{ top: top - bufPx, height: bufPx }}>
                              TRAVEL BUFFER
                            </div>
                            <div className="buffer" style={{ top: top + height, height: bufPx }}>
                              TRAVEL BUFFER
                            </div>
                            <Link className="job" href={`/bookings/${b.bookingId}`}
                              style={{ top, height: Math.max(24, height - 3), background: crew.color }}>
                              <b>{b.label}</b>
                              <span>{s.toFormat('HH:mm')}–{e.toFormat('HH:mm')}</span>
                              {booking && <span>{booking.site.address1}</span>}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="note" style={{ marginTop: 14 }}>
        <b>This view reads the same index the booking engine writes to.</b> If a slot is
        blocked here, it is genuinely unbookable on your website — there is no second
        source of truth that could disagree.
      </div>
    </>
  );
}
