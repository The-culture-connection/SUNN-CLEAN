import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@sunnclean/shared';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, isAllowed } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const Schema = z.object({ idToken: z.string().min(20) });

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });

  try {
    const decoded = await auth().verifyIdToken(parsed.data.idToken, true);
    if (decoded.admin !== true) {
      return NextResponse.json({
        ok: false,
        error: 'This account does not have admin access. Run `npm run grant-admin <email>` to grant it.',
      }, { status: 403 });
    }
    if (!isAllowed(decoded.email)) {
      return NextResponse.json({ ok: false, error: 'This email is not on the allowlist.' }, { status: 403 });
    }

    const sessionCookie = await auth().createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: 'Sign-in failed. Please try again.' }, { status: 401 });
  }
}
