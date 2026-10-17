import { and, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { hashPassword, validatePassword, type Actor } from '@/lib/auth';
import { audit } from './audit';
import { hashNationalId } from './imports';
import { AUTO_LINK_REASON, claimPlayer, isMinor } from './claims';
import { assertNotChild } from './children';
import { ClaimPending } from './claims';

const { users, players, guardians, claimRequests } = schema;

const norm = (s: string) => s.toLowerCase().replace(/["'`׳״.,\-]/g, ' ').replace(/\s+/g, ' ').trim();
const sameName = (a: { first: string; last: string }, b: { first: string; last: string }) =>
  (norm(a.first) === norm(b.first) && norm(a.last) === norm(b.last)) || (norm(a.first) === norm(b.last) && norm(a.last) === norm(b.first));

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
    if (dup) return Object.assign(await claimPlayer(db, actor, { firstName: input.firstName, lastName: input.lastName, birthDate: input.birthDate, nationalId: input.nationalId, forChild: input.forChild }), { linkedExisting: true as const });
  }
  if (!input.forChild && isMinor(input.birthDate)) throw new Error('שחקן מתחת לגיל 18 נרשם על ידי הורה (בחרו "ילד/ה")');
  // The player may already exist from the federation's data (Loglig) with rankings and history. Same name, gender and birth year:
  // if exactly one such profile is still unclaimed it is linked right away (and queued for the federation to confirm or undo);
  // if it belongs to someone else, or several fit, a request goes to the federation instead of creating a duplicate.
  const y = input.birthDate.getUTCFullYear();
  const pool = await db.select().from(players).where(and(
    eq(players.gender, input.gender), gte(players.birthDate, new Date(Date.UTC(y, 0, 1))), lt(players.birthDate, new Date(Date.UTC(y + 1, 0, 1))),
  ));
  const same = pool.filter((x) => sameName({ first: x.firstName, last: x.lastName }, { first: input.firstName, last: input.lastName }));
  const free: typeof same = [];
  for (const x of same) {
    const kids = (await db.select({ id: guardians.id }).from(guardians).where(eq(guardians.playerId, x.id))).length;
    if (!x.accountId && (!input.forChild || !kids)) free.push(x);
  }
  if (free.length === 1 && same.length === 1) {
    const found = free[0] as NonNullable<(typeof free)[0]>;
    if (input.forChild) await db.insert(guardians).values({ playerId: found.id, userId: actor.id, relation: 'parent' }).onConflictDoNothing();
    else await db.update(players).set({ accountId: actor.id }).where(eq(players.id, found.id));
    // the federation's date is often an estimate (July 1st): keep the exact one the parent knows
    const estimated = found.birthDate.getUTCMonth() === 6 && found.birthDate.getUTCDate() === 1;
    if (estimated) await db.update(players).set({ birthDate: input.birthDate }).where(eq(players.id, found.id));
    if (idHash && !found.idHash) await db.update(players).set({ idHash }).where(eq(players.id, found.id));
    await db.insert(claimRequests).values({ userId: actor.id, playerId: found.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthDate: input.birthDate, idHash, forChild: !!input.forChild, reason: AUTO_LINK_REASON });
    await audit(db, actor, 'player.claim.auto-name', 'player', found.id, { forChild: !!input.forChild });
    return Object.assign(found, { linkedExisting: true as const });
  }
  if (same.length) {
    const [req] = await db.insert(claimRequests).values({
      userId: actor.id, playerId: same.length === 1 ? (same[0] as NonNullable<(typeof same)[0]>).id : null, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      birthDate: input.birthDate, idHash, forChild: !!input.forChild, reason: 'נמצא שחקן קיים עם אותו שם ושנת לידה שכבר משויך או שיש כמה התאמות',
    }).returning();
    await audit(db, actor, 'player.claim.request', 'claim', req!.id, { forChild: !!input.forChild });
    throw new ClaimPending(req!.id);
  }
  const [p] = await db.insert(players).values({
    firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthDate: input.birthDate, gender: input.gender,
    clubId: input.clubId ?? null, idHash, accountId: input.forChild ? null : actor.id,
  }).returning();
  const row = p as NonNullable<typeof p>;
  if (input.forChild) await db.insert(guardians).values({ playerId: row.id, userId: actor.id, relation: 'parent' });
  await audit(db, actor, 'player.create', 'player', row.id, { forChild: !!input.forChild });
  return Object.assign(row, { linkedExisting: false as const });
}
