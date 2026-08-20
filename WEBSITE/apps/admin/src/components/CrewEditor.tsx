'use client';

import { useEffect, useState } from 'react';
// Type-only: pulling runtime values out of the shared package would drag
// firebase-admin into the browser bundle. The server page passes the values in.
import type { Crew, DayHours, Weekday } from '@sunnclean/shared';
import { Err, Toggle, useAction } from '@/components/ui';

export interface CrewEditorProps {
  crews: Crew[];
  /** Weekday keys in display order, with their labels. */
  days: { key: Weekday; label: string }[];
  /** Starting values for the next crew, colour already chosen. */
  newCrew: Omit<Crew, 'id'>;
}

/* ---------------- minutes <-> "HH:MM" ---------------- */

/** 1560 (2am the next day) renders as "02:00"; the +1 day lives in a checkbox. */
function toTimeInput(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string): number {
  const [h, m] = value.split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0;
  return Math.max(0, Math.min(1439, hours * 60 + mins));
}

/* ---------------- draft shape ---------------- */

/** Number fields are held as strings so half-typed values ("1.", "") survive. */
interface Draft {
  id: string;
  name: string;
  color: string;
  active: boolean;
  headcount: string;
  priority: string;
  hourlyCostPerCleaner: string;
  notes: string;
  hours: Record<Weekday, DayHours>;
  blackoutDates: string[];
}

/** Only used when a crew row somehow arrives without a colour. */
const FALLBACK_COLOR = '#3A90D6';

function toDraft(c: Crew, days: { key: Weekday; label: string }[]): Draft {
  const hours = {} as Record<Weekday, DayHours>;
  for (const { key } of days) {
    const h = c.hours?.[key];
    hours[key] = { enabled: h?.enabled ?? false, start: h?.start ?? 0, end: h?.end ?? 0 };
  }
  return {
    id: c.id,
    name: c.name ?? '',
    color: c.color || FALLBACK_COLOR,
    active: c.active ?? true,
    headcount: String(c.headcount ?? 2),
    priority: String(c.priority ?? 1),
    hourlyCostPerCleaner: String(c.hourlyCostPerCleaner ?? 0),
    notes: c.notes ?? '',
    hours,
    blackoutDates: [...(c.blackoutDates ?? [])].sort(),
  };
}

export function CrewEditor({ crews, days, newCrew }: CrewEditorProps) {
  const { run, pending, error } = useAction();
  const [drafts, setDrafts] = useState<Draft[]>(() => crews.map((c) => toDraft(c, days)));
  const [newBlackout, setNewBlackout] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState('');

  // Re-sync after router.refresh() brings fresh crews down from the server.
  useEffect(() => { setDrafts(crews.map((c) => toDraft(c, days))); }, [crews, days]);

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
    setSaved('');
  }

  function patchDay(id: string, day: Weekday, change: Partial<DayHours>) {
    setDrafts((list) => list.map((d) => (
      d.id === id ? { ...d, hours: { ...d.hours, [day]: { ...d.hours[day], ...change } } } : d
    )));
    setSaved('');
  }

  async function saveCrew(d: Draft) {
    const res = await run('/api/crews', {
      id: d.id,
      name: d.name,
      color: d.color,
      active: d.active,
      headcount: d.headcount,
      priority: d.priority,
      hourlyCostPerCleaner: d.hourlyCostPerCleaner,
      notes: d.notes,
      hours: d.hours,
      blackoutDates: d.blackoutDates,
    });
    if (res) setSaved(d.id);
  }

  async function addCrew() {
    await run('/api/crews', newCrew);
  }

  async function removeCrew(d: Draft) {
    const ok = window.confirm(
      `Delete ${d.name}? Any future openings this crew was offering on the website disappear straight away.`,
    );
    if (!ok) return;
    await run('/api/crews', { id: d.id }, 'DELETE');
  }

  function addBlackout(d: Draft) {
    const date = (newBlackout[d.id] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (d.blackoutDates.includes(date)) return;
    patch(d.id, { blackoutDates: [...d.blackoutDates, date].sort() });
    setNewBlackout((m) => ({ ...m, [d.id]: '' }));
  }

  return (
    <>
      <div className="phead">
        <div>
          <h1>Crews</h1>
          <p>Who works, when they work, and what a crew hour costs you.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={addCrew} disabled={pending}>
          + Add crew
        </button>
      </div>

      <div className="note">
        <b>What changing this does.</b> Adding a crew immediately opens more bookable slots on
        your website — customers can pick times that crew is free. Turning a crew off removes
        its future slots so nobody can book it, but it never touches jobs that are already on
        the calendar. Those stay exactly where they are until you move them.
      </div>

      <Err>{error}</Err>

      {drafts.length === 0 && (
        <div className="acard">
          <div className="cb">
            <p>You have no crews yet. Add one so the website has somebody to book.</p>
          </div>
        </div>
      )}

      <div className="grid g2">
        {drafts.map((d) => (
          <div key={d.id} className="crewcard" style={{ borderTopColor: d.color }}>
            <div className="setrow">
              <div className="sl" style={{ flex: 1 }}>
                <div className="f2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`name-${d.id}`}>Crew name</label>
                    <input id={`name-${d.id}`} value={d.name}
                      onChange={(e) => patch(d.id, { name: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`color-${d.id}`}>Calendar colour</label>
                    <input id={`color-${d.id}`} type="color" value={d.color}
                      onChange={(e) => patch(d.id, { color: e.target.value })} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`chip ${d.active ? 'c-good' : 'c-mute'}`}>
                  {d.active ? 'Taking work' : 'Off'}
                </span>
                <Toggle on={d.active} label={`${d.name} active`}
                  onChange={(v) => patch(d.id, { active: v })} />
              </div>
            </div>

            <div className="crewmeta">
              <div>
                <span>Cleaners on this crew</span>
                <input type="number" min={1} step={1} value={d.headcount}
                  aria-label={`${d.name} headcount`}
                  onChange={(e) => patch(d.id, { headcount: e.target.value })} />
              </div>
              <div>
                <span>Hourly cost per cleaner</span>
                <input type="number" min={0} step={0.25} value={d.hourlyCostPerCleaner}
                  aria-label={`${d.name} hourly cost per cleaner`}
                  onChange={(e) => patch(d.id, { hourlyCostPerCleaner: e.target.value })} />
              </div>
              <div>
                <span>Priority (1 gets offered first)</span>
                <input type="number" min={1} step={1} value={d.priority}
                  aria-label={`${d.name} priority`}
                  onChange={(e) => patch(d.id, { priority: e.target.value })} />
              </div>
              <div>
                <span>Notes to yourself</span>
                <input value={d.notes} aria-label={`${d.name} notes`}
                  onChange={(e) => patch(d.id, { notes: e.target.value })} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 16, marginBottom: 8 }}>
              <span className="flabel">Operating hours</span>
              <div className="hint">
                These hours belong to this crew alone — a second crew can work completely
                different days. Only the hours you switch on here become bookable.
              </div>
            </div>

            {days.map(({ key, label }) => {
              const h = d.hours[key];
              const overnight = h.end >= 1440;
              return (
                <div className="hrow" key={key}>
                  <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{label}</span>
                  <input type="time" value={toTimeInput(h.start)} disabled={!h.enabled}
                    aria-label={`${label} start`}
                    onChange={(e) => patchDay(d.id, key, { start: fromTimeInput(e.target.value) })} />
                  <div>
                    <input type="time" value={toTimeInput(h.end)} disabled={!h.enabled}
                      aria-label={`${label} end`}
                      onChange={(e) => patchDay(d.id, key, {
                        end: fromTimeInput(e.target.value) + (overnight ? 1440 : 0),
                      })} />
                    <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <input type="checkbox" checked={overnight} disabled={!h.enabled}
                        style={{ width: 15, height: 15, padding: 0 }}
                        onChange={(e) => patchDay(d.id, key, {
                          end: (h.end % 1440) + (e.target.checked ? 1440 : 0),
                        })} />
                      ends next day
                    </label>
                  </div>
                  <Toggle on={h.enabled} label={`${label} enabled`}
                    onChange={(v) => patchDay(d.id, key, { enabled: v })} />
                </div>
              );
            })}

            <div className="field" style={{ marginTop: 16, marginBottom: 8 }}>
              <span className="flabel">Days this crew is off</span>
              <div className="hint">
                Holidays, training days, a week away. The website will not offer this crew on
                these dates.
              </div>
            </div>

            {d.blackoutDates.length === 0 && (
              <p className="hint" style={{ marginBottom: 8 }}>No days off booked in.</p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {d.blackoutDates.map((date) => (
                <span key={date} className="chip c-mute">
                  {date}
                  <button type="button" className="btn btn-ghost btn-sm"
                    style={{ padding: '0 5px', border: 0, background: 'transparent', fontSize: '.85rem' }}
                    aria-label={`Remove ${date} from ${d.name}`}
                    onClick={() => patch(d.id, {
                      blackoutDates: d.blackoutDates.filter((x) => x !== date),
                    })}>
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="hrow" style={{ gridTemplateColumns: '1fr auto' }}>
              <input type="date" value={newBlackout[d.id] ?? ''}
                aria-label={`Add a day off for ${d.name}`}
                onChange={(e) => setNewBlackout((m) => ({ ...m, [d.id]: e.target.value }))} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addBlackout(d)}>
                Add day off
              </button>
            </div>

            <div className="setrow" style={{ marginTop: 12 }}>
              <div className="sl">
                {saved === d.id && <span className="chip c-good">Saved</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => removeCrew(d)} disabled={pending}>
                  Delete
                </button>
                <button type="button" className="btn btn-navy btn-sm"
                  onClick={() => saveCrew(d)} disabled={pending}>
                  Save {d.name || 'crew'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
