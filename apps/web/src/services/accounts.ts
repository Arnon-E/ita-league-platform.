import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { hashPassword, validatePassword, type Actor } from '@/lib/auth';
import { audit } from './audit';
import { hashNationalId } from './imports';
import { claimPlayer, isMinor } from './claims';
import { assertNotChild } from './children';

const { users, players, guardians } = schema;

/** Self sign-up: always creates a PLAYER account. Roles above that are granted by an admin. */
export async function signUp(db: Db, input: { email: string; password: string; name: string; phone?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('כתובת אימייל לא תקינה');
  const bad = validatePassword(input.password);
  if (bad) throw new Error(bad);
  if (!input.name.trim()) throw new Error('נדרש שם');
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (dup) throw new Error('כתובת האימייל כבר רשומה');
  const [u] = await db.insert(users).values({ email, name: input.name.trim(), phone: input.phone ?? null, passwordHash: await hashPassword(input.password), role: 'PLAYER' }).returning();
  return u as NonNullable<typeof u>;
}

/**
 * Creates a player profile. For a child, the account becomes the guardian; a self profile links the account itself.
 * If a player with the same national ID already exists, the account is linked to it when the birth date matches and nobody
 * else has claimed it; otherwise a request for an admin is queued and ClaimPending is thrown.
 */
export async function addPlayerProfile(db: Db, actor: Actor, input: {
  firstName: string; lastName: string; birthDate: Date; gender: 'MALE' | 'FEMALE'; clubId?: string; nationalId?: string; forChild?: boolean;
}) {
  await assertNotChild(db, actor);
  const idHash = input.nationalId ? hashNationalId(input.nationalId) : null;
  if (idHash) {
    const [dup] = await db.select().from(players).where(eq(players.idHash, idHash));
    if (dup) return claimPlayer(db, actor, { firstName: input.firstName, lastName: input.lastName, birthDate: input.birthDate, nationalId: input.nationalId, forChild: input.forChild });
  }
  if (!input.forChild && isMinor(input.birthDate)) throw new Error('שחקן מתחת לגיל 18 נרשם על ידי הורה (בחרו "ילד/ה")');
  const [p] = await db.insert(players).values({
    firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthDate: input.birthDate, gender: input.gender,
    clubId: input.clubId ?? null, idHash, accountId: input.forChild ? null : actor.id,
  }).returning();
  const row = p as NonNullable<typeof p>;
  if (input.forChild) await db.insert(guardians).values({ playerId: row.id, userId: actor.id, relation: 'parent' });
  await audit(db, actor, 'player.create', 'player', row.id, { forChild: !!input.forChild });
  return row;
}
