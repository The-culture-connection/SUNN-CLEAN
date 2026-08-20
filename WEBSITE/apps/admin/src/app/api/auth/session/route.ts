import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE, SESSION_MAX_AGE_MS, createSessionToken, verifyCredentials,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

/**
 * Brute-force throttle. In-memory, so it resets on redeploy and is per-instance
 * — enough to blunt scripted guessing, but no substitute for a strong
 * ADMIN_PASSWORD.
 */
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]!.trim() || 'unknown';
}

function throttled(key: string): boolean {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  const entry = attempts.get(key);
  return !!entry && entry.count >= MAX_ATTEMPTS && entry.resetAt > now;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
  else entry.count += 1;
}

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Enter a username and password.' }, { status: 400 });
  }

  const key = clientKey(req);
  if (throttled(key)) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' },
      { status: 429 },
    );
  }

  if (!verifyCredentials(parsed.data.username, parsed.data.password)) {
    recordFailure(key);
    return NextResponse.json(
      { ok: false, error: 'That username or password is not right.' },
      { status: 401 },
    );
  }

  attempts.delete(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  return res;
}
