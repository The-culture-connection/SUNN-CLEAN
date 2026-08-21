'use client';
import { useState } from 'react';

export function ContactForm() {
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [website, setWebsite] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, website }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(data.error ?? 'Could not send that message.'); return; }
      setSent(true);
    } catch { setErr('Could not reach the server. Please try again.'); }
    finally { setBusy(false); }
  }

  if (sent) return <div className="note" role="status"><b>Thanks — we&apos;ve got your message and will be in touch shortly.</b></div>;

  return (
    <form className="card" onSubmit={submit}>
      <div className="field">
        <label htmlFor="cn">Your name *</label>
        <input id="cn" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="f2">
        <div className="field">
          <label htmlFor="ce">Email *</label>
          <input id="ce" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="cp">Phone</label>
          <input id="cp" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cm">Message *</label>
        <textarea id="cm" rows={5} required minLength={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
