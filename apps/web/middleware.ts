import { NextResponse, type NextRequest } from 'next/server';

/** Cheap gate: anything but /login needs a session cookie. The JWT is verified on every server render (requireActor). */
export function middleware(req: NextRequest) {
  const has = req.cookies.get('ita_session');
  if (!has && !/^\/(login|register|api\/webhooks|api\/v1|manifest|icon)/.test(req.nextUrl.pathname)) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
