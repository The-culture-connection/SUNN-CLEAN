import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@sunnclean/shared';

/**
 * Admin auth.
 *
 * IMPORTANT: middleware runs on the Edge runtime and firebase-admin needs Node
 * APIs, so `verifySessionCookie` CANNOT run there. Middleware only does a cheap
 * presence check for UX; the real verification happens here, in the server
 * layout and in every API route. Never rely on the layout having run — route
 * handlers are directly addressable.
 */

export const SESSION_COOKIE = 'sunnclean_session';
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export interface AdminUser { uid: string; email: string; name: string }

function allowlist(): string[] {
  return (process.env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowed(email: string | undefined): boolean {
  const list = allowlist();
  if (!email) return false;
  // An empty allowlist means "rely on the custom claim alone" — which is the
  // correct behaviour for a fresh install before the env var is set.
  if (list.length === 0) return true;
  return list.includes(email.toLowerCase());
}

/** Returns the signed-in admin, or null. Never throws. */
export async function currentUser(): Promise<AdminUser | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await auth().verifySessionCookie(cookie, true);
    if (decoded.admin !== true) return null;
    if (!isAllowed(decoded.email)) return null;
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      name: (decoded.name as string) ?? decoded.email ?? 'Admin',
    };
  } catch {
    return null;
  }
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
