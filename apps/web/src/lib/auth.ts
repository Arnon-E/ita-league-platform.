import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

const { users } = schema;
export type Role = (typeof users.$inferSelect)['role'];

export interface Actor {
  id: string;
  role: Role;
  /** Set when a super admin acts as another user. */
  impersonatedBy?: string;
}

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? 'dev-only-secret-change-me-32bytes!!');
export const SESSION_COOKIE = 'ita_session';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'הסיסמה חייבת להכיל לפחות 10 תווים';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'הסיסמה חייבת להכיל אותיות וספרות';
  return null;
}

export async function signSession(actor: Actor, ttl = '12h'): Promise<string> {
  return new SignJWT({ role: actor.role, imp: actor.impersonatedBy })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(actor.id).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { id: payload.sub, role: payload.role as Role, impersonatedBy: payload.imp as string | undefined };
  } catch {
    return null;
  }
}

export type LoginResult = { ok: true; actor: Actor; token: string } | { ok: false; reason: 'invalid' | 'locked' | 'inactive' };

/** Email + password login with lockout after repeated failures. */
export async function login(db: Db, email: string, password: string, now = new Date()): Promise<LoginResult> {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u) { await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.'); return { ok: false, reason: 'invalid' }; }
  if (u.lockedUntil && u.lockedUntil > now) return { ok: false, reason: 'locked' };
  if (!u.active) return { ok: false, reason: 'inactive' };
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    const fails = u.failedLogins + 1;
    await db.update(users).set({
      failedLogins: fails >= MAX_FAILS ? 0 : fails,
      lockedUntil: fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
    }).where(eq(users.id, u.id));
    return { ok: false, reason: fails >= MAX_FAILS ? 'locked' : 'invalid' };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  const actor: Actor = { id: u.id, role: u.role };
  return { ok: true, actor, token: await signSession(actor) };
}
