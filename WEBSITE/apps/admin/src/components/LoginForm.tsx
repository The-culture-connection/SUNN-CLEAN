'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setErr(data.error ?? 'Sign-in failed.'); return; }
      router.push(params.get('next') || '/');
      router.refresh();
    } catch {
      setErr('Sign-in failed. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="u">Username</label>
        <input id="u" type="text" autoComplete="username" required value={username}
          onChange={(ev) => setUsername(ev.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="p">Password</label>
        <input id="p" type="password" autoComplete="current-password" required value={password}
          onChange={(ev) => setPassword(ev.target.value)} />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
