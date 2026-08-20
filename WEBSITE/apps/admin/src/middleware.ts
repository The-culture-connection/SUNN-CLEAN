import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware. This is a UX convenience, NOT a security boundary — it only
 * checks that a session cookie is present, because firebase-admin cannot run on
 * the Edge runtime. Real verification happens in the server layout and in every
 * API route (see lib/auth.ts).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  const hasCookie = req.cookies.has('sunnclean_session');
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo-mark.png).*)'],
};
