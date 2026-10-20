import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { buildSenders } from '@/lib/senders';

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? process.env.SESSION_SECRET : 'dev-only-secret-change-me-32bytes!!');
const fingerprint = (passwordHash: string) => createHash('sha256').update(passwordHash).digest('hex').slice(0, 24);

/** A one-hour link token. It carries a fingerprint of the current password hash, so changing the password invalidates every older link. */
export async function resetToken(u: { id: string; passwordHash: string }) {
  return new SignJWT({ p: 'reset', k: fingerprint(u.passwordHash) }).setProtectedHeader({ alg: 'HS256' }).setSubject(u.id).setIssuedAt().setExpirationTime('1h').sign(secret());
}

/** Emails the reset link when the address belongs to an account. Always resolves the same way, so the form never reveals who is registered. */
export async function requestPasswordReset(db: Db, emailRaw: string, origin: string): Promise<{ sent: boolean; configured: boolean; failed?: boolean }> {
  const email = emailRaw.trim().toLowerCase();
  const send = buildSenders(db).EMAIL;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!send) return { sent: false, configured: false };
  if (u && u.active) {
    const link = `${origin}/reset?token=${await resetToken(u)}`;
    try {
      await send({ userId: u.id, title: 'איפוס סיסמה', body: `לבחירת סיסמה חדשה: ${link} (הקישור תקף לשעה)` } as never);
    } catch (e) {
      // the provider refused (unverified sender domain, bad key...): say so instead of crashing the page
      console.error('password reset email failed', e instanceof Error ? e.message : e);
      return { sent: false, configured: true, failed: true };
    }
    return { sent: true, configured: true };
  }
  return { sent: false, configured: true };
}

export async function applyPasswordReset(db: Db, token: string, password: string): Promise<'ok' | 'invalid' | { weak: string }> {
  const weak = validatePassword(password);
  if (weak) return { weak };
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.p !== 'reset' || !payload.sub) return 'invalid';
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    if (!u || !u.active || fingerprint(u.passwordHash) !== payload.k) return 'invalid';
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, sessionsValidAfter: new Date() }).where(eq(schema.users.id, u.id));
    return 'ok';
  } catch {
    return 'invalid';
  }
}
