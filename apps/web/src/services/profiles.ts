import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { assertNotChild, isChildEmail } from './children';

const { players, guardians, entries, pointsAwards, users, follows } = schema;

/** A player profile may be changed by its guardian (a parent) or by the account that owns it, never by a child's own login. */
async function mineOrThrow(db: Db, actor: Actor, playerId: string) {
  await assertNotChild(db, actor);
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) throw new Error('הפרופיל לא נמצא');
  const [g] = await db.select().from(guardians).where(and(eq(guardians.playerId, playerId), eq(guardians.userId, actor.id)));
  if (!g && p.accountId !== actor.id) throw new Error('אין הרשאה לפרופיל הזה');
  return p;
}

const activeEntries = (db: Db, playerId: string) =>
  db.select({ id: entries.id }).from(entries).where(and(eq(entries.playerId, playerId), ne(entries.status, 'WITHDRAWN'), ne(entries.status, 'REJECTED')));

/**
 * Fixes a profile's details. The name can always be corrected. Birth date and gender decide which categories the player may enter,
 * so they cannot change while there are active registrations. Profiles synced from the federation's system are read-only here.
 */
export async function updateProfile(db: Db, actor: Actor, playerId: string, input: { firstName: string; lastName: string; birthDate: Date; gender: 'MALE' | 'FEMALE' }) {
  const p = await mineOrThrow(db, actor, playerId);
  if (p.logligId) throw new Error('הפרופיל מסונכרן ממערכת האיגוד. לשינוי פרטים פנו לאיגוד');
  const firstName = input.firstName.trim(); const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error('נדרשים שם פרטי ושם משפחה');
  if (Number.isNaN(input.birthDate.getTime()) || input.birthDate > new Date()) throw new Error('תאריך לידה לא תקין');
  if (input.gender !== 'MALE' && input.gender !== 'FEMALE') throw new Error('נדרש מין');
  const changesEligibility = input.gender !== p.gender || input.birthDate.getTime() !== p.birthDate.getTime();
  if (changesEligibility && (await activeEntries(db, playerId)).length) throw new Error('יש הרשמות פעילות, ולכן אי אפשר לשנות תאריך לידה או מין. בטלו את ההרשמות או פנו לאיגוד');
  await db.update(players).set({ firstName, lastName, birthDate: input.birthDate, gender: input.gender }).where(eq(players.id, playerId));
  if (p.accountId && p.accountId !== actor.id) {
    // the child's login shows the same name
    const [u] = await db.select().from(users).where(eq(users.id, p.accountId));
    if (u && isChildEmail(u.email)) await db.update(users).set({ name: `${firstName} ${lastName}` }).where(eq(users.id, u.id));
  }
  await audit(db, actor, 'player.update', 'player', playerId, {});
  return { ok: true as const };
}

/**
 * Removes a profile from the account. A profile that never registered or scored is deleted outright. One with history stays in the
 * federation's records (results and rankings belong to the league), but is detached from this account and its child login is closed.
 */
export async function removeProfile(db: Db, actor: Actor, playerId: string) {
  const p = await mineOrThrow(db, actor, playerId);
  const hasHistory = (await db.select({ id: entries.id }).from(entries).where(eq(entries.playerId, playerId))).length > 0
    || (await db.select({ id: pointsAwards.id }).from(pointsAwards).where(eq(pointsAwards.playerId, playerId))).length > 0
    || !!p.logligId;

  if (p.accountId && p.accountId !== actor.id) {
    // close the child's own login and free its user name
    const [u] = await db.select().from(users).where(eq(users.id, p.accountId));
    if (u && isChildEmail(u.email)) await db.update(users).set({ active: false, email: `closed-${u.id}@kid.ita.invalid`, sessionsValidAfter: new Date() }).where(eq(users.id, u.id));
  }
  if (!hasHistory) {
    await db.delete(follows).where(and(eq(follows.kind, 'PLAYER'), eq(follows.targetId, playerId)));
    await db.delete(players).where(eq(players.id, playerId)); // documents and guardian links go with it
    await audit(db, actor, 'player.delete', 'player', playerId, {});
    return { deleted: true as const };
  }
  // with history: withdraw what is still open, then detach from the account
  const open = await activeEntries(db, playerId);
  if (open.length) await db.update(entries).set({ status: 'WITHDRAWN' }).where(inArray(entries.id, open.map((e) => e.id)));
  await db.delete(guardians).where(and(eq(guardians.playerId, playerId), eq(guardians.userId, actor.id)));
  if (p.accountId) await db.update(players).set({ accountId: null }).where(eq(players.id, playerId));
  await audit(db, actor, 'player.detach', 'player', playerId, {});
  return { deleted: false as const };
}
