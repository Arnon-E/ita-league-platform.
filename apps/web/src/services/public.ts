import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { entryNames } from './queries';
import { rankingFor } from './rankings';
import { ensureDefaultRuleSet, loadRuleSet } from './rules';

const { players, clubs, entries, categories, matches, tournaments, pointsAwards } = schema;

export async function searchPlayers(db: Db, q: string, clubId?: string, limit = 100, opts: { gender?: 'MALE' | 'FEMALE'; age?: number; offset?: number } = {}) {
  const conds = [];
  if (opts.gender) conds.push(eq(players.gender, opts.gender));
  if (opts.age) conds.push(sql`${players.birthDate} >= make_date(${new Date().getFullYear() - opts.age}, 1, 1)::timestamptz`);
  for (const w of q.trim().split(/\s+/).filter(Boolean)) conds.push(or(ilike(players.firstName, `%${w}%`), ilike(players.lastName, `%${w}%`)));
  if (clubId) conds.push(eq(players.clubId, clubId));
  return db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(players.lastName), asc(players.firstName)).limit(limit).offset(opts.offset ?? 0);
}

export async function listClubs(db: Db) {
  return db.select({ c: clubs, n: sql<number>`count(${players.id})::int` }).from(clubs).leftJoin(players, eq(players.clubId, clubs.id))
    .groupBy(clubs.id).orderBy(asc(clubs.name));
}

/** A player's career: entries with tournament, matches played and ranking-point awards. */
export async function playerProfile(db: Db, id: string) {
  const [row] = await db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId)).where(eq(players.id, id));
  if (!row) return null;
  const ents = await db.select({ e: entries, c: categories, t: tournaments }).from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId))
    .where(and(eq(entries.playerId, id), eq(entries.status, 'CONFIRMED'))).orderBy(desc(tournaments.startDate));
  const entryIds = ents.map((x) => x.e.id);
  const catIds = [...new Set(ents.map((x) => x.c.id))];
  const names = await entryNames(db, catIds);
  const ms = catIds.length ? await db.select().from(matches).where(inArray(matches.categoryId, catIds)).orderBy(asc(matches.scheduledStart)) : [];
  const mine = ms.filter((m) => (m.aEntryId && entryIds.includes(m.aEntryId)) || (m.bEntryId && entryIds.includes(m.bEntryId)));
  const awards = await db.select().from(pointsAwards).where(eq(pointsAwards.playerId, id)).orderBy(desc(pointsAwards.date));
  let wins = 0, losses = 0;
  for (const m of mine) {
    if (!m.winnerEntryId) continue;
    if (entryIds.includes(m.winnerEntryId)) wins++; else losses++;
  }
  return { ...row, ents, names, matches: mine, awards, wins, losses, entryIds };
}

export async function clubDetail(db: Db, id: string) {
  const [c] = await db.select().from(clubs).where(eq(clubs.id, id));
  if (!c) return null;
  const ps = await db.select().from(players).where(eq(players.clubId, id)).orderBy(asc(players.lastName), asc(players.firstName));
  return { c, ps };
}

/** Matches across all tournaments: upcoming with a time slot, and recent results. */
export async function liveFeed(db: Db) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const base = () => db.select({ m: matches, c: categories, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId));
  const ready = and(sql`${matches.aEntryId} is not null`, sql`${matches.bEntryId} is not null`);
  // three small, indexed-friendly queries instead of one wide scan: live now, next up, latest results
  const [live, upcoming, results] = await Promise.all([
    base().where(and(ready, eq(matches.live, true), eq(matches.status, 'SCHEDULED'))).limit(50),
    base().where(and(ready, eq(matches.status, 'SCHEDULED'), eq(matches.live, false), gte(matches.scheduledStart, dayStart))).orderBy(asc(matches.scheduledStart)).limit(60),
    base().where(and(ready, sql`${matches.status} <> 'SCHEDULED'`)).orderBy(desc(sql`coalesce(${matches.scheduledStart}, ${matches.notBefore}, ${matches.updatedAt})`)).limit(40),
  ]);
  const ids = [...new Set([...live, ...upcoming, ...results].flatMap((r) => [r.m.aEntryId, r.m.bEntryId]).filter((x): x is string => !!x))];
  const named = ids.length
    ? await db.select({ id: entries.id, f: players.firstName, l: players.lastName }).from(entries).innerJoin(players, eq(players.id, entries.playerId)).where(inArray(entries.id, ids))
    : [];
  return { live, upcoming, results, names: new Map(named.map((r) => [r.id, `${r.f} ${r.l}`])) };
}

export const AGE_GROUPS = [12, 14, 16, 18] as const;

/** Junior age groups use the calendar-year age (year of the ranking date minus year of birth); U14 includes everyone aged 14 or younger. */
export function inAgeGroup(birth: Date, group: number | undefined, asOf = new Date()): boolean {
  if (!group) return true;
  return asOf.getFullYear() - birth.getFullYear() <= group;
}

export interface RankingTableRow { rank: number; playerId: string; name: string; club: string | null; points: number; counted: number }

/** National ranking, optionally narrowed to an age group and/or a club. Ranks are renumbered inside the narrowed list. */
export async function rankingTable(db: Db, o: { gender: 'MALE' | 'FEMALE'; age?: number; clubId?: string }): Promise<RankingTableRow[]> {
  const rs = await ensureDefaultRuleSet(db);
  const asOf = new Date();
  const rows = await rankingFor(db, o.gender, asOf, await loadRuleSet(db, rs.id));
  if (!rows.length) return [];
  const ps = await db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId)).where(inArray(players.id, rows.map((r) => r.playerId)));
  const byId = new Map(ps.map((x) => [x.p.id, x]));
  const out: RankingTableRow[] = [];
  for (const r of rows) {
    const x = byId.get(r.playerId);
    if (!x) continue;
    if (!inAgeGroup(x.p.birthDate, o.age, asOf)) continue;
    if (o.clubId && x.p.clubId !== o.clubId) continue;
    out.push({ rank: out.length + 1, playerId: r.playerId, name: `${x.p.firstName} ${x.p.lastName}`, club: x.club, points: r.points, counted: r.counted.length });
  }
  return out;
}
