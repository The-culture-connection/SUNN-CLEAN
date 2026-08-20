import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Admin auth.
 *
 * A single shared credential, checked against ADMIN_USERNAME / ADMIN_PASSWORD.
 * On success we mint an HMAC-signed token and store it in an httpOnly cookie;
 * every server component and API route re-verifies that signature.
 *
 * IMPORTANT: middleware runs on the Edge runtime and only does a cheap presence
 * check for UX. The real verification happens here. Never rely on the layout
 * having run — route handlers are directly addressable.
 */

export const SESSION_COOKIE = 'sunnclean_session';
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export interface AdminUser { uid: string; email: string; name: string }

const DEFAULT_USERNAME = 'sunn clean';
const DEFAULT_PASSWORD = 'sunnclean';

function expectedUsername(): string {
  return (process.env.ADMIN_USERNAME ?? DEFAULT_USERNAME).trim().toLowerCase();
}

function expectedPassword(): string {
  return process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
}

/**
 * Signing key for the session cookie. Falls back to a value derived from the
 * credentials so a fresh deploy works with no extra setup — which also means
 * changing the password invalidates every existing session.
 */
function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || `sunnclean:${expectedUsername()}:${expectedPassword()}`;
}

/** The identity stamped onto audit-log entries. */
function adminEmail(): string {
  const first = (process.env.ADMIN_ALLOWED_EMAILS ?? '').split(',')[0]?.trim();
  return first || 'admin@sunnclean.local';
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Constant-time credential check. Both fields are always compared. */
export function verifyCredentials(username: string, password: string): boolean {
  const userOk = safeEqual(username.trim().toLowerCase(), expectedUsername());
  const passOk = safeEqual(password, expectedPassword());
  return userOk && passOk;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'admin', exp: Date.now() + SESSION_MAX_AGE_MS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

/** Returns the signed-in admin, or null. Never throws. */
export async function currentUser(): Promise<AdminUser | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie || !verifySessionToken(cookie)) return null;
  return { uid: 'admin', email: adminEmail(), name: 'SUNN CLEAN Admin' };
}

/** Use in server components. Redirects to the login screen when signed out. */
export async function requireUser(): Promise<AdminUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

/** Use in route handlers. Returns null so the caller can send a 401. */
export async function requireApiUser(): Promise<AdminUser | null> {
  return currentUser();
}
