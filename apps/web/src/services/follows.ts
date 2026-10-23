import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { notifyUser } from './notifications';
import { entryNames } from './queries';
import { playerRanks } from './ranking-sql';

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

export interface FollowedPlayer {
  id: string; name: string; club: string | null; clubId: string | null; rank: number | null; points: number;
  recent: { id: string; won: boolean; vs: string; score: string; competition: string; when: Date | null }[];
  next: { id: string; vs: string; competition: string; when: Date | null; court: string | null } | null;
}

/** Everything the personal "following" screen needs: per followed player the rank, latest results and next match, plus clubs and tournaments. */
export async function followedOverview(db: Db, userId: string) {
  const fs = await myFollows(db, userId);
  const pIds = fs.filter((f) => f.kind === 'PLAYER').map((f) => f.targetId);
  const cIds = fs.filter((f) => f.kind === 'CLUB').map((f) => f.targetId);
  const tIds = fs.filter((f) => f.kind === 'TOURNAMENT').map((f) => f.targetId);
  const { clubs, tournaments, entries, categories, matches } = schema;

  const ps = pIds.length ? await db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId)).where(inArray(players.id, pIds)) : [];
  const rankBy = new Map<string, { rank: number; points: number }>();
  for (const [id, r] of await playerRanks(db, ps.map((x) => x.p.id))) rankBy.set(id, { rank: r.rank, points: r.points });

  const ents = pIds.length ? await db.select({ e: entries, c: categories }).from(entries).innerJoin(categories, eq(categories.id, entries.categoryId))
    .where(and(inArray(entries.playerId, pIds), eq(entries.status, 'CONFIRMED'))) : [];
  const catIds = [...new Set(ents.map((x) => x.c.id))];
  const names = await entryNames(db, catIds);
  const ms = catIds.length ? await db.select({ m: matches, t: tournaments }).from(matches).innerJoin(categories, eq(categories.id, matches.categoryId))
    .innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(inArray(matches.categoryId, catIds)).orderBy(asc(matches.scheduledStart)) : [];

  const players2: FollowedPlayer[] = ps.map(({ p, club }) => {
    const mine = new Set(ents.filter((x) => x.e.playerId === p.id).map((x) => x.e.id));
    const own = ms.filter(({ m }) => (m.aEntryId && mine.has(m.aEntryId)) || (m.bEntryId && mine.has(m.bEntryId)));
    const side = (m: (typeof ms)[number]['m']) => (m.aEntryId && mine.has(m.aEntryId) ? 'a' : 'b');
    const vs = (m: (typeof ms)[number]['m']) => names.get((side(m) === 'a' ? m.bEntryId : m.aEntryId) ?? '') ?? '';
    const done = own.filter(({ m }) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.aEntryId && m.bEntryId)
      .sort((x, y) => (y.m.scheduledStart?.getTime() ?? 0) - (x.m.scheduledStart?.getTime() ?? 0)).slice(0, 5);
    const upcoming = own.filter(({ m }) => m.status === 'SCHEDULED' && m.aEntryId && m.bEntryId).sort((x, y) => (x.m.scheduledStart?.getTime() ?? Infinity) - (y.m.scheduledStart?.getTime() ?? Infinity))[0];
    return {
      id: p.id, name: `${p.firstName} ${p.lastName}`, club, clubId: p.clubId, rank: rankBy.get(p.id)?.rank ?? null, points: rankBy.get(p.id)?.points ?? 0,
      recent: done.map(({ m, t }) => {
        const sets = (m.sets as { a: number; b: number }[]) ?? [];
        const mineIsA = side(m) === 'a';
        return {
          id: m.id, won: !!m.winnerEntryId && mine.has(m.winnerEntryId), vs: vs(m), competition: t.name, when: m.scheduledStart,
          score: sets.map((x) => (mineIsA ? `${x.a}-${x.b}` : `${x.b}-${x.a}`)).join(' '),
        };
      }),
      next: upcoming ? { id: upcoming.m.id, vs: vs(upcoming.m), competition: upcoming.t.name, when: upcoming.m.scheduledStart, court: upcoming.m.courtLabel } : null,
    };
  });
  const order = new Map(pIds.map((id, i) => [id, i]));
  players2.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const clubList = cIds.length ? await db.select().from(clubs).where(inArray(clubs.id, cIds)) : [];
  const tourList = tIds.length ? await db.select().from(tournaments).where(inArray(tournaments.id, tIds)).orderBy(desc(tournaments.startDate)) : [];
  return { players: players2, clubs: clubList, tournaments: tourList };
}
