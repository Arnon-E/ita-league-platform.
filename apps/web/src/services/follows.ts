import { and, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { notifyUser } from './notifications';

const { follows, players, guardians } = schema;
export type FollowKind = 'PLAYER' | 'CLUB' | 'TOURNAMENT';
const KINDS: FollowKind[] = ['PLAYER', 'CLUB', 'TOURNAMENT'];

export async function isFollowing(db: Db, userId: string, kind: FollowKind, targetId: string) {
  const [r] = await db.select({ id: follows.id }).from(follows).where(and(eq(follows.userId, userId), eq(follows.kind, kind), eq(follows.targetId, targetId)));
  return !!r;
}

/** Toggles a follow and returns the new state. */
export async function toggleFollow(db: Db, userId: string, kind: string, targetId: string): Promise<boolean> {
  if (!KINDS.includes(kind as FollowKind) || !targetId) throw new Error('יעד לא חוקי');
  if (await isFollowing(db, userId, kind as FollowKind, targetId)) {
    await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.kind, kind), eq(follows.targetId, targetId)));
    return false;
  }
  await db.insert(follows).values({ userId, kind, targetId }).onConflictDoNothing();
  return true;
}

export async function myFollows(db: Db, userId: string) {
  return db.select().from(follows).where(eq(follows.userId, userId));
}

/**
 * Tells fans about something that happened to these players / in this tournament.
 * `exclude` lists players whose own account and guardians were already notified directly, so nobody gets it twice.
 */
export async function notifyFollowers(
  db: Db, scope: { players: string[]; tournamentId?: string; exclude?: string[] }, kind: string, title: string, body: string,
) {
  if (!scope.players.length && !scope.tournamentId) return 0;
  const ps = scope.players.length ? await db.select({ id: players.id, clubId: players.clubId }).from(players).where(inArray(players.id, scope.players)) : [];
  const clubIds = [...new Set(ps.map((p) => p.clubId).filter((x): x is string => !!x))];
  const conds = [];
  if (scope.players.length) conds.push(and(eq(follows.kind, 'PLAYER'), inArray(follows.targetId, scope.players)));
  if (clubIds.length) conds.push(and(eq(follows.kind, 'CLUB'), inArray(follows.targetId, clubIds)));
  if (scope.tournamentId) conds.push(and(eq(follows.kind, 'TOURNAMENT'), eq(follows.targetId, scope.tournamentId)));
  const fs = await db.select({ userId: follows.userId }).from(follows).where(or(...conds));
  const skip = new Set<string>();
  if (scope.exclude?.length) {
    for (const p of await db.select({ a: players.accountId }).from(players).where(inArray(players.id, scope.exclude))) if (p.a) skip.add(p.a);
    for (const g of await db.select({ u: guardians.userId }).from(guardians).where(inArray(guardians.playerId, scope.exclude))) skip.add(g.u);
  }
  const users = [...new Set(fs.map((f) => f.userId))].filter((u) => !skip.has(u));
  for (const u of users) await notifyUser(db, u, kind, title, body);
  return users.length;
}
