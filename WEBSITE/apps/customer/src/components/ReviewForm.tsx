'use client';
import { useState } from 'react';
import type { CatalogItem } from '@sunnclean/shared';

/** Open submission: anyone may post. Verification happens server-side by
 *  matching the email against a completed booking, and nothing appears
 *  publicly until an admin approves it. */
export function ReviewForm({ services, token }: { services: CatalogItem[]; token?: string }) {
  const [open, setOpen] = useState(!!token);
  const [rating, setRating] = useState(0);
  const [f, setF] = useState({
    title: '', body: '', displayName: '', displayNameMode: 'business',
    businessTypeLabel: '', serviceId: services[0]?.id ?? '', email: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    if (!rating) { setErr('Please choose a star rating.'); return; }
    if (f.body.trim().length < 40) { setErr('Please write at least a couple of sentences (40 characters).'); return; }
    setBusy(true); setErr('');
    try {
      const photos = await Promise.all(files.slice(0, 4).map(compress));
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, rating, photos, token }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(data.error ?? 'Could not submit that review.'); return; }
      setMsg("Thank you — your review has been submitted and will appear once we've read it.");
    } catch { setErr('Could not reach the server. Please try again.'); }
    finally { setBusy(false); }
  }

  if (msg) return <div className="note" role="status"><b>{msg}</b></div>;

  if (!open) {
    return (
      <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>✍ Write a Review</button>
        <span style={{ fontSize: '.82rem', color: 'var(--slate)' }}>
          Anyone can post. We read every one before publishing.
        </span>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <h3 style={{ marginBottom: 14 }}>Write a review</h3>
      <div className="field">
        <span className="flabel">Your rating *</span>
        <div className="starpick">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={n <= rating ? 'on' : ''}
              aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === rating}
              onClick={() => setRating(n)}>★</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="rt">Headline</label>
        <input id="rt" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="rb">Your review *</label>
        <textarea id="rb" rows={5} maxLength={4000} value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
          placeholder="What did we do well? Anything we could improve?" />
        <p className="hint">{f.body.length} characters · minimum 40</p>
      </div>
      <div className="f2">
        <div className="field">
          <label htmlFor="rn">Display name</label>
          <input id="rn" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="rm">Show as</label>
          <select id="rm" value={f.displayNameMode} onChange={(e) => setF({ ...f, displayNameMode: e.target.value })}>
            <option value="business">Business name</option>
            <option value="first_name">First name + initial</option>
            <option value="anonymous">Anonymous</option>
          </select>
        </div>
      </div>
      <div className="f2">
        <div className="field">
          <label htmlFor="rbt">Business type &amp; city</label>
          <input id="rbt" placeholder="Medical office, Brooklyn" value={f.businessTypeLabel}
            onChange={(e) => setF({ ...f, businessTypeLabel: e.target.value })} />
        </div>
        {services.length > 0 && (
          <div className="field">
            <label htmlFor="rs">Which service?</label>
            <select id="rs" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="rp">Add photos (optional, up to 4)</label>
        <input id="rp" type="file" accept="image/jpeg,image/png,image/webp" multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))} />
        {files.length > 0 && <p className="hint">{files.length} selected</p>}
      </div>
      <div className="field">
        <label htmlFor="re">Email (not published)</label>
        <input id="re" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <p className="hint">
          If this matches a completed booking your review gets a{' '}
          <b style={{ color: 'var(--good)' }}>✓ Verified Customer</b> badge automatically.
        </p>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
        </button>
        {!token && <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </div>
  );
}

/** Resize in the browser so uploads work on a phone and storage stays cheap. */
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.82);
}
