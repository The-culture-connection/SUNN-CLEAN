'use client';

import { useState } from 'react';
import { useAction, Err } from './ui';
import { money } from '@/lib/format';

/**
 * Complete / reschedule / reassign / cancel.
 *
 * Reschedule and reassign both go through the same server transaction as a new
 * booking, so the 1-hour travel buffer cannot be violated even by an admin. A
 * rejected move returns a plain-language reason rather than failing silently.
 */
export function JobActions(props: {
  bookingId: string;
  status: string;
  crews: { id: string; name: string; color: string }[];
  currentCrewId: string;
  startIso: string;
  durationMinutes: number;
  completion: { crewNotes: string; actualStart: string; actualEnd: string };
  photoUrls: string[];
  timezone: string;
}) {
  const { run, pending, error, setError } = useAction();
  const [mode, setMode] = useState<'' | 'complete' | 'move' | 'cancel'>('');

  const [actualStart, setActualStart] = useState(props.completion.actualStart);
  const [actualEnd, setActualEnd] = useState(props.completion.actualEnd);
  const [crewNotes, setCrewNotes] = useState(props.completion.crewNotes);

  const [newStart, setNewStart] = useState(props.startIso);
  const [newCrewId, setNewCrewId] = useState(props.currentCrewId);
  const [photos, setPhotos] = useState<string[]>([]);

  const done = props.status === 'completed';
  const dead = props.status === 'cancelled' || props.status === 'no_show';

  async function upload(files: FileList | null) {
    if (!files) return;
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, 8)) out.push(await compress(f));
    setPhotos([...photos, ...out].slice(0, 8));
  }

  return (
    <div className="acard">
      <div className="ch">
        <h3>{done ? 'Completion' : 'Actions'}</h3>
        {done && <span className="chip c-good">✓ Marked complete</span>}
      </div>
      <div className="cb">
        <Err>{error}</Err>

        {!mode && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!done && !dead && (
              <button className="btn btn-primary btn-sm" onClick={() => { setError(''); setMode('complete'); }}>
                Mark job complete
              </button>
            )}
            {!dead && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setMode('move'); }}>
                Reschedule / reassign
              </button>
            )}
            {!dead && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)', borderColor: '#f3d9d7' }}
                onClick={() => { setError(''); setMode('cancel'); }}>
                Cancel booking
              </button>
            )}
            {done && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setMode('complete'); }}>
                Edit completion details
              </button>
            )}
          </div>
        )}

        {/* ---------------- complete ---------------- */}
        {mode === 'complete' && (
          <div>
            <div className="f2">
              <div className="field">
                <label htmlFor="as">Actual start</label>
                <input id="as" type="datetime-local" value={actualStart}
                  onChange={(e) => setActualStart(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ae">Actual end</label>
                <input id="ae" type="datetime-local" value={actualEnd}
                  onChange={(e) => setActualEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cn">Crew notes</label>
              <textarea id="cn" rows={3} value={crewNotes} onChange={(e) => setCrewNotes(e.target.value)}
                placeholder="Anything the customer should know, or that affects the invoice." />
            </div>
            <div className="field">
              <label htmlFor="ph">Job photos (optional)</label>
              <input id="ph" type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} />
              <p className="hint">
                Photos can be published to your public Before &amp; After gallery afterwards.
              </p>
            </div>
            {(props.photoUrls.length > 0 || photos.length > 0) && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                {props.photoUrls.map((u, i) => (
                  <img key={`e${i}`} src={u} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 8 }} />
                ))}
                {photos.map((u, i) => (
                  <img key={`n${i}`} src={u} alt="" style={{
                    width: 62, height: 62, objectFit: 'cover', borderRadius: 8,
                    outline: '2px solid var(--good)',
                  }} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={pending}
                onClick={async () => {
                  const ok = await run(`/api/bookings/${props.bookingId}/complete`, {
                    actualStart, actualEnd, crewNotes, photos,
                  });
                  if (ok) { setMode(''); setPhotos([]); }
                }}>
                {pending ? 'Saving…' : done ? 'Save changes' : 'Mark complete'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
            </div>
            {!done && (
              <p className="hint">
                This raises an &ldquo;invoice needed&rdquo; item on your dashboard and calculates
                the crew payout from the actual hours.
              </p>
            )}
          </div>
        )}

        {/* ---------------- reschedule ---------------- */}
        {mode === 'move' && (
          <div>
            <div className="f2">
              <div className="field">
                <label htmlFor="ns">New start time</label>
                <input id="ns" type="datetime-local" value={newStart}
                  onChange={(e) => setNewStart(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="nc">Crew</label>
                <select id="nc" value={newCrewId} onChange={(e) => setNewCrewId(e.target.value)}>
                  {props.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="note" style={{ fontSize: '.8rem' }}>
              The move is validated against the travel buffer. If it would leave less than
              the required gap it will be refused — the schedule can&apos;t be put into an
              impossible state, even by you.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-navy btn-sm" disabled={pending}
                onClick={async () => {
                  const ok = await run(`/api/bookings/${props.bookingId}/reschedule`, {
                    startLocal: newStart, crewId: newCrewId,
                  });
                  if (ok) setMode('');
                }}>
                {pending ? 'Moving…' : 'Move booking'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
            </div>
          </div>
        )}

        {/* ---------------- cancel ---------------- */}
        {mode === 'cancel' && (
          <div>
            <div className="warn" style={{ marginTop: 0 }}>
              <b>This frees the time slot immediately</b> and it becomes bookable on your
              website again. The booking stays on record.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" style={{ background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' }}
                disabled={pending}
                onClick={async () => {
                  const ok = await run(`/api/bookings/${props.bookingId}/cancel`, {});
                  if (ok) setMode('');
                }}>
                {pending ? 'Cancelling…' : 'Yes, cancel this booking'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Keep it</button>
            </div>
          </div>
        )}

        {done && !mode && props.photoUrls.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <span className="flabel">Job photos</span>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {props.photoUrls.map((u, i) => (
                <img key={i} src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
              ))}
            </div>
            <p className="hint">Publish a before/after pair from the Before &amp; After page.</p>
          </div>
        )}

        {done && !mode && props.completion.crewNotes && (
          <div style={{ marginTop: 14 }}>
            <span className="flabel">Crew notes</span>
            <p style={{ fontSize: '.87rem', color: 'var(--slate)' }}>{props.completion.crewNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

