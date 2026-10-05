import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { entryNames } from './queries';

const { players, clubs, entries, categories, matches, tournaments, pointsAwards } = schema;

export async function searchPlayers(db: Db, q: string, clubId?: string, limit = 100) {
  const conds = [];
  for (const w of q.trim().split(/\s+/).filter(Boolean)) conds.push(or(ilike(players.firstName, `%${w}%`), ilike(players.lastName, `%${w}%`)));
  if (clubId) conds.push(eq(players.clubId, clubId));
  return db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(players.lastName), asc(players.firstName)).limit(limit);
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
  const rows = await db.select({ m: matches, c: categories, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId))
    .where(or(gte(matches.scheduledStart, dayStart), and(sql`${matches.status} <> 'SCHEDULED'`, gte(matches.updatedAt, new Date(Date.now() - 30 * 864e5)))))
    .orderBy(asc(matches.scheduledStart)).limit(300);
  const names = await entryNames(db, [...new Set(rows.map((r) => r.c.id))]);
  const ready = rows.filter((r) => r.m.aEntryId && r.m.bEntryId);
  return {
    upcoming: ready.filter((r) => r.m.status === 'SCHEDULED' && r.m.scheduledStart),
    results: ready.filter((r) => r.m.status !== 'SCHEDULED').sort((a, b) => +b.m.updatedAt - +a.m.updatedAt),
    names,
  };
}
