'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clientAuth, signInWithEmailAndPassword } from '@/lib/firebaseClient';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const cred = await signInWithEmailAndPassword(clientAuth(), email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(data.error ?? 'Sign-in failed.'); return; }
      router.push(params.get('next') || '/');
      router.refresh();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setErr(
        code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
          ? 'That email or password is not right.'
          : code.includes('too-many-requests')
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Sign-in failed. Please try again.',
      );
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="e">Email</label>
        <input id="e" type="email" autoComplete="username" required value={email}
          onChange={(ev) => setEmail(ev.target.value)} />
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
