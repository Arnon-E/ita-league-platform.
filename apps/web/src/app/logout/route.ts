import { NextResponse } from 'next/server';
import { db } from '@/db';
import { revokeSessions, SESSION_COOKIE } from '@/lib/auth';
import { getActor } from '@/lib/session';

/** Signs out this device; with all=1 it also ends the sessions on every other device. */
export async function POST(req: Request) {
  const all = new URL(req.url).searchParams.get('all') === '1';
  if (all) { const a = await getActor(); if (a) await revokeSessions(db, a.id); }
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
