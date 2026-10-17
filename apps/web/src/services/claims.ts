import { assertNotChild } from './children';
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { hashNationalId } from './imports';
import { notifyUser } from './notifications';

const { users, players, guardians, claimRequests } = schema;
type PlayerRow = typeof players.$inferSelect;

/** Thrown when no automatic match was possible and a request was queued for an admin instead. */
export class ClaimPending extends Error {
  constructor(public requestId: string) { super('לא נמצאה התאמה מלאה. הבקשה נשלחה לאישור האיגוד'); }
}

export const isMinor = (birth: Date, now = new Date()) => now.getUTCFullYear() - birth.getUTCFullYear() - (now < new Date(Date.UTC(now.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate())) ? 1 : 0) < 18;

const day = (d: Date) => d.toISOString().slice(0, 10);
const nextDay = (d: Date) => new Date(Date.parse(`${day(d)}T00:00:00Z`) + 86_400_000);

async function isFree(db: Db, p: PlayerRow, forChild: boolean) {
  if (p.accountId) return false;
  if (!forChild) return true;
  const [g] = await db.select({ id: guardians.id }).from(guardians).where(eq(guardians.playerId, p.id));
  return !g;
}

async function attach(db: Db, userId: string, p: PlayerRow, forChild: boolean) {
  if (forChild) await db.insert(guardians).values({ playerId: p.id, userId, relation: 'parent' }).onConflictDoNothing();
  else await db.update(players).set({ accountId: userId }).where(eq(players.id, p.id));
}

/**
 * Links the signed-in account to an existing player. A national ID + matching birth date on an unclaimed player links at once;
 * anything else (different birth date, player already claimed, no ID) is queued as a request for an admin to decide.
 * Returns the player when linked, throws ClaimPending when queued.
 */
export async function claimPlayer(db: Db, actor: Actor, input: {
  firstName: string; lastName: string; birthDate: Date; nationalId?: string; forChild?: boolean; reason?: string;
}): Promise<PlayerRow> {
  await assertNotChild(db, actor);
  const forChild = !!input.forChild;
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error('נדרשים שם פרטי ושם משפחה');
  if (Number.isNaN(input.birthDate.getTime()) || input.birthDate > new Date()) throw new Error('תאריך לידה לא תקין');
  if (!forChild && isMinor(input.birthDate)) throw new Error('שחקן מתחת לגיל 18 משויך על ידי הורה (בחרו "ילד/ה")');
  const idHash = input.nationalId?.replace(/\D/g, '') ? hashNationalId(input.nationalId) : null;

  const byId = idHash ? (await db.select().from(players).where(eq(players.idHash, idHash)))[0] : undefined;
  let candidate = byId;
  if (!candidate) {
    const named = await db.select().from(players).where(and(
      eq(players.firstName, firstName), eq(players.lastName, lastName),
      gte(players.birthDate, new Date(`${day(input.birthDate)}T00:00:00Z`)), lt(players.birthDate, nextDay(input.birthDate)),
    ));
    if (named.length === 1) candidate = named[0];
  }

  if (candidate) {
    const [mine] = await db.select({ id: players.id }).from(players).where(and(eq(players.id, candidate.id), eq(players.accountId, actor.id)));
    const [kid] = await db.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.playerId, candidate.id), eq(guardians.userId, actor.id)));
    if (mine || kid) throw new Error('השחקן כבר קיים בחשבון שלך');
  }

  // automatic: the ID matched and so did the birth date, and nobody has claimed this player yet
  if (byId && day(byId.birthDate) === day(input.birthDate) && await isFree(db, byId, forChild)) {
    await attach(db, actor.id, byId, forChild);
    await audit(db, actor, 'player.claim.auto', 'player', byId.id, { forChild });
    return byId;
  }

  const [open] = await db.select({ id: claimRequests.id }).from(claimRequests).where(and(
    eq(claimRequests.userId, actor.id), eq(claimRequests.status, 'PENDING'),
    candidate ? eq(claimRequests.playerId, candidate.id) : and(eq(claimRequests.firstName, firstName), eq(claimRequests.lastName, lastName)),
  ));
  if (open) throw new Error('כבר קיימת בקשת שיוך ממתינה לשחקן הזה');

  const [req] = await db.insert(claimRequests).values({
    userId: actor.id, playerId: candidate?.id ?? null, firstName, lastName, birthDate: input.birthDate, idHash, forChild, reason: input.reason?.trim() || null,
  }).returning();
  await audit(db, actor, 'player.claim.request', 'claim', req!.id, { playerId: candidate?.id ?? null, forChild });
  throw new ClaimPending(req!.id);
}

export async function listClaims(db: Db, actor: Actor, status: 'PENDING' | 'ALL' = 'PENDING') {
  assertCan(actor, 'player.link');
  const rows = await db.select({ c: claimRequests, u: { id: users.id, name: users.name, email: users.email }, p: players }).from(claimRequests)
    .innerJoin(users, eq(users.id, claimRequests.userId))
    .leftJoin(players, eq(players.id, claimRequests.playerId))
    .where(status === 'PENDING' ? eq(claimRequests.status, 'PENDING') : undefined)
    .orderBy(desc(claimRequests.createdAt)).limit(200);
  return rows;
}

export async function countPendingClaims(db: Db, actor: Actor) {
  assertCan(actor, 'player.link');
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(claimRequests).where(eq(claimRequests.status, 'PENDING'));
  return r?.n ?? 0;
}

/** Admin: links a user to a player directly (as the player themself, or as a guardian). Refuses to take over a player already linked to someone else. */
export async function linkPlayer(db: Db, actor: Actor, playerId: string, userId: string, forChild = false) {
  assertCan(actor, 'player.link');
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) throw new Error('השחקן לא נמצא');
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error('המשתמש לא נמצא');
  if (!forChild && p.accountId && p.accountId !== userId) throw new Error('השחקן כבר משויך למשתמש אחר. יש לבטל את השיוך קודם');
  await attach(db, userId, p, forChild);
  await audit(db, actor, 'player.link', 'player', playerId, { userId, forChild });
  // a manual link answers any request the same user has open for this player, so it does not linger in the queue
  await db.update(claimRequests).set({ status: 'APPROVED', reviewedById: actor.id, reviewNote: 'שויך ידנית', reviewedAt: new Date() })
    .where(and(eq(claimRequests.userId, userId), eq(claimRequests.playerId, playerId), eq(claimRequests.status, 'PENDING')));
  await notifyUser(db, userId, 'claim', 'שחקן שויך לחשבון שלך', `${p.firstName} ${p.lastName} שויך לחשבון שלך על ידי האיגוד.`);
}

/** Admin: removes the self link and/or a guardian link. */
export async function unlinkPlayer(db: Db, actor: Actor, playerId: string, userId?: string) {
  assertCan(actor, 'player.link');
  if (userId) await db.delete(guardians).where(and(eq(guardians.playerId, playerId), eq(guardians.userId, userId)));
  else await db.update(players).set({ accountId: null }).where(eq(players.id, playerId));
  await audit(db, actor, 'player.unlink', 'player', playerId, { userId: userId ?? null });
}

/** Admin decision on a request. Approving links the request's user to `playerId` (default: the candidate the system found). */
export async function resolveClaim(db: Db, actor: Actor, claimId: string, decision: 'APPROVED' | 'REJECTED', opts: { playerId?: string; note?: string } = {}) {
  assertCan(actor, 'player.link');
  const [c] = await db.select().from(claimRequests).where(eq(claimRequests.id, claimId));
  if (!c) throw new Error('הבקשה לא נמצאה');
  if (c.status !== 'PENDING') throw new Error('הבקשה כבר טופלה');
  if (decision === 'REJECTED') {
    if (!opts.note?.trim()) throw new Error('נדרשת סיבת דחייה');
  } else {
    const pid = opts.playerId || c.playerId;
    if (!pid) throw new Error('בחרו שחקן לשיוך');
    const [p] = await db.select().from(players).where(eq(players.id, pid));
    if (!p) throw new Error('השחקן לא נמצא');
    if (!c.forChild && p.accountId && p.accountId !== c.userId) throw new Error('השחקן כבר משויך למשתמש אחר. יש לבטל את השיוך קודם');
    await attach(db, c.userId, p, c.forChild);
    if (c.idHash && !p.idHash) {
      const [taken] = await db.select({ id: players.id }).from(players).where(eq(players.idHash, c.idHash));
      if (!taken) await db.update(players).set({ idHash: c.idHash }).where(eq(players.id, p.id));
    }
    await db.update(claimRequests).set({ playerId: pid }).where(eq(claimRequests.id, c.id));
  }
  await db.update(claimRequests).set({ status: decision, reviewedById: actor.id, reviewNote: opts.note?.trim() || null, reviewedAt: new Date() }).where(eq(claimRequests.id, c.id));
  await audit(db, actor, `player.claim.${decision.toLowerCase()}`, 'claim', c.id, { playerId: opts.playerId ?? c.playerId });
  await notifyUser(db, c.userId, 'claim',
    decision === 'APPROVED' ? 'בקשת השיוך אושרה' : 'בקשת השיוך נדחתה',
    decision === 'APPROVED' ? `${c.firstName} ${c.lastName} שויך לחשבון שלך.` : `הסיבה: ${opts.note}`);
}

/** Admin search box for the manual linking screen. */
export async function searchPlayersForLink(db: Db, actor: Actor, q: string) {
  assertCan(actor, 'player.link');
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, '')}%`;
  const rows = await db.select({ p: players, acc: { id: users.id, name: users.name, email: users.email } }).from(players)
    .leftJoin(users, eq(users.id, players.accountId))
    .where(or(ilike(players.firstName, like), ilike(players.lastName, like), ilike(sql`${players.firstName} || ' ' || ${players.lastName}`, like)))
    .orderBy(players.lastName, players.firstName).limit(30);
  const ids = rows.map((r) => r.p.id);
  const gs = ids.length
    ? await db.select({ playerId: guardians.playerId, userId: guardians.userId, email: users.email }).from(guardians).innerJoin(users, eq(users.id, guardians.userId))
      .where(inArray(guardians.playerId, ids))
    : [];
  return rows.map((r) => ({ ...r, guardians: gs.filter((g) => g.playerId === r.p.id) }));
}

export async function findUserByEmail(db: Db, actor: Actor, email: string) {
  assertCan(actor, 'player.link');
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, email.trim().toLowerCase()));
  return u;
}
