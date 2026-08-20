'use client';
import { useState } from 'react';

/** Requests are raised to admin rather than acted on directly — a commercial
 *  contract should have a human in the loop before a crew is stood down. */
export function BookingActions({ token, requests }: {
  token: string; requests: { cancellationRequested: boolean; rescheduleRequested: boolean };
}) {
  const [mode, setMode] = useState<'' | 'reschedule' | 'cancel'>('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(
    requests.cancellationRequested || requests.rescheduleRequested);
  const [busy, setBusy] = useState(false);

  async function send(kind: 'reschedule' | 'cancel') {
    setBusy(true);
    try {
      await fetch(`/api/bookings/${token}/request`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, note }),
      });
      setSent(true);
    } finally { setBusy(false); }
  }

  if (sent) return (
    <div className="note" style={{ marginTop: 26 }} role="status">
      <b>We&apos;ve received your request</b> and will be in touch shortly to sort it out.
    </div>
  );

  return (
    <div style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Need to change something?</h2>
      {!mode ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setMode('reschedule')}>Request a reschedule</button>
          <button className="btn btn-ghost" onClick={() => setMode('cancel')}>Request cancellation</button>
        </div>
      ) : (
        <div className="card">
          <div className="field">
            <label htmlFor="note">
              {mode === 'cancel' ? 'Why are you cancelling? (optional)' : 'What date or time would work better?'}
            </label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-navy" disabled={busy} onClick={() => send(mode)}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMode('')}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
