'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Re-exported for client components. The implementations live in lib/format
// because a 'use client' module cannot supply functions to a server component.
export { money, durationLabel } from '@/lib/format';

/** Fire-and-refresh POST helper used by every admin mutation control. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  async function run(url: string, body?: unknown, method = 'POST') {
    setError('');
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      setError(data.error ?? 'That did not work. Please try again.');
      return null;
    }
    start(() => router.refresh());
    return data;
  }
  return { run, pending, error, setError };
}

export function Toggle({ on, onChange, label }: {
  on: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`}
      role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)} />
  );
}

export function Err({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <div className="err" role="alert">{children}</div>;
}
