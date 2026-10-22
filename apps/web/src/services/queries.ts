import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { memo } from '@/lib/memo';
import type { Db } from '@/db';
import { schema } from '@/db';

const { entries, players, categories, matches, tournaments, clubs } = schema;

export async function entryNames(db: Db, categoryIds: string[]): Promise<Map<string, string>> {
  if (!categoryIds.length) return new Map();
  const rows = await db.select({ id: entries.id, f: players.firstName, l: players.lastName }).from(entries)
    .innerJoin(players, eq(players.id, entries.playerId)).where(inArray(entries.categoryId, categoryIds));
  return new Map(rows.map((r) => [r.id, `${r.f} ${r.l}`]));
}

export async function listTournaments(db: Db) {
  // the home page and the app list read this on every visit; a few seconds of sharing is invisible and saves most of the traffic
  return memo('tournaments', 20_000, () => db.select().from(tournaments).orderBy(desc(tournaments.startDate)));
}

export async function tournamentDetail(db: Db, id: string) {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) return null;
  const cats = await db.select().from(categories).where(eq(categories.tournamentId, id)).orderBy(asc(categories.name));
  const ids = cats.map((c) => c.id);
  const names = await entryNames(db, ids);
  const ents = ids.length ? await db.select({ e: entries, p: players, club: clubs.name }).from(entries).innerJoin(players, eq(players.id, entries.playerId)).leftJoin(clubs, eq(clubs.id, players.clubId)).where(inArray(entries.categoryId, ids)) : [];
  const ms = ids.length ? await db.select().from(matches).where(inArray(matches.categoryId, ids)).orderBy(asc(matches.stage), asc(matches.round), asc(matches.index)) : [];
  const draws = ids.length ? await db.select().from(schema.draws).where(inArray(schema.draws.categoryId, ids)) : [];
  // doubles draws mirrored from Loglig (pairs; kept apart from the singles model)
  const doubles = await db.select().from(schema.doublesMatches).where(eq(schema.doublesMatches.tournamentId, id))
    .orderBy(asc(schema.doublesMatches.category), asc(schema.doublesMatches.stage), asc(schema.doublesMatches.groupName), asc(schema.doublesMatches.scheduledStart));
  return { t, cats, names, ents, ms, draws, doubles };
}

export async function matchDetail(db: Db, id: string) {
  const [row] = await db.select({ m: matches, c: categories, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(matches.id, id));
  if (!row) return null;
  const names = await entryNames(db, [row.c.id]);
  return { ...row, names };
}

export async function playersNotIn(db: Db, categoryId: string, gender: string) {
  const inCat = (await db.select({ p: entries.playerId }).from(entries).where(eq(entries.categoryId, categoryId))).map((x) => x.p);
  const all = await db.select().from(players).orderBy(asc(players.lastName));
  return all.filter((p) => !inCat.includes(p.id) && (gender === 'OPEN' || p.gender === gender));
}

export { and };

/** Every category's tournament, gender, name and birth-year limits: what the home page and the app use to say which competitions fit someone. */
export function categoryBriefs(db: Db) {
  return memo('category-briefs', 20_000, () => db.select({ tid: categories.tournamentId, gender: categories.gender, name: categories.name, minBirthYear: categories.minBirthYear, maxBirthYear: categories.maxBirthYear }).from(categories));
}

/** Ids of tournaments that have at least one entry. */
export function tournamentsWithEntries(db: Db) {
  return memo('tournaments-with-entries', 20_000, () => db.selectDistinct({ tid: categories.tournamentId }).from(entries).innerJoin(categories, eq(categories.id, entries.categoryId)));
}
