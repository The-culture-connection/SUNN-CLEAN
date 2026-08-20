import 'server-only';
import { NextResponse } from 'next/server';
import { audit } from '@sunnclean/shared';
import { requireApiUser, type AdminUser } from './auth';

/**
 * Every admin API route wraps its handler in `guard`. Route handlers are
 * directly addressable, so each one verifies the session independently rather
 * than trusting that the layout ran.
 */
export async function guard<T>(
  fn: (user: AdminUser) => Promise<T>,
): Promise<NextResponse> {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  try {
    const result = await fn(user);
    return NextResponse.json({ ok: true, ...(result ?? {}) as object });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[admin-api]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function logAction(
  user: AdminUser, action: string, targetType: string, targetId: string, detail = '',
) {
  await audit({
    action, targetType, targetId, byUid: user.uid, byEmail: user.email, detail,
  });
}
