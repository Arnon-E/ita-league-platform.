import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { PLACEHOLDER_SQL } from '@/lib/placeholders';
import { entryNames } from './queries';
import { memo } from '@/lib/memo';

const { players, clubs, entries, categories, matches, tournaments, pointsAwards } = schema;

export type PlayerSection = 'YOUTH' | 'ADULTS' | 'MASTERS';
/** The federation's three sections by age this year: youth up to 18, adults 19-29, masters 30 and over. */
export const sectionOfBirthYear = (birthYear: number, now = new Date()): PlayerSection => {
  const age = now.getFullYear() - birthYear;
  return age <= 18 ? 'YOUTH' : age < 30 ? 'ADULTS' : 'MASTERS';
};

export async function searchPlayers(db: Db, q: string, clubId?: string, limit = 100, opts: { gender?: 'MALE' | 'FEMALE'; age?: number; offset?: number; activeOnly?: boolean; section?: PlayerSection } = {}) {
  const conds: (SQL | undefined)[] = [sql`not ((${players.firstName} || ' ' || ${players.lastName}) ~* ${PLACEHOLDER_SQL})`];
  // Active = has an account, ranking points from the last 18 months, or an entry in a competition that ended within the last 12 months.
  if (opts.activeOnly) {
    conds.push(sql`(${players.accountId} is not null
      or exists (select 1 from points_awards pa where pa.player_id = ${players.id} and pa.date >= now() - interval '18 months')
      or exists (select 1 from entries e join categories c on c.id = e.category_id join tournaments t on t.id = c.tournament_id
                 where e.player_id = ${players.id} and t.end_date >= now() - interval '12 months'))`);
  }
  if (opts.gender) conds.push(eq(players.gender, opts.gender));
  if (opts.section) {
    const y = new Date().getFullYear();
    const from = (age: number) => sql`make_date(${y - age}, 1, 1)::timestamptz`;
    conds.push(opts.section === 'YOUTH' ? sql`${players.birthDate} >= ${from(18)}` : opts.section === 'ADULTS' ? sql`${players.birthDate} < ${from(18)} and ${players.birthDate} >= ${from(29)}` : sql`${players.birthDate} < ${from(29)}`);
  }
  if (opts.age) conds.push(sql`${players.birthDate} >= make_date(${new Date().getFullYear() - opts.age}, 1, 1)::timestamptz`);
  // a word also matches the Latin name a player was seen under at tournaments abroad ("Strauss" finds "שטראוס" once the two are linked)
  for (const w of q.trim().split(/\s+/).filter(Boolean)) conds.push(or(ilike(players.firstName, `%${w}%`), ilike(players.lastName, `%${w}%`), sql`exists (select 1 from abroad_player_links l where l.player_id = ${players.id} and l.status in ('AUTO', 'CONFIRMED') and l.name ilike ${`%${w}%`})`));
  if (clubId) conds.push(eq(players.clubId, clubId));
  return db.select({ p: players, club: clubs.name }).from(players).leftJoin(clubs, eq(clubs.id, players.clubId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(players.lastName), asc(players.firstName)).limit(limit).offset(opts.offset ?? 0);
}

/**
 * Every club with its player count, for the lists and the club pickers. A club's `info` (roster, officials, teams) can be large and these lists
 * only show the phone number from it, so only that is read; the club's own page reads the whole thing. Clubs change rarely, so one query a minute
 * per instance is plenty.
 */
export async function listClubs(db: Db) {
  return memo('clubs', 60_000, async () => {
    const rows = await db.select({ id: clubs.id, name: clubs.name, city: clubs.city, phone: sql<string | null>`${clubs.info}->>'phone'`, n: sql<number>`count(${players.id})::int` })
      .from(clubs).leftJoin(players, eq(players.clubId, clubs.id)).groupBy(clubs.id).orderBy(asc(clubs.name));
    return rows.map(({ phone, n, ...c }) => ({ c: { ...c, info: phone ? ({ phone } as Record<string, unknown>) : null }, n }));
  });
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
const feedMemo = new Map<string, { at: number; p: ReturnType<typeof liveFeedUncached> }>();
/** Same page size asked again within a few seconds (the page, the app, many visitors on one instance) shares one query. */
export function liveFeed(db: Db, o: { upcoming?: number; results?: number } = {}) {
  const key = `${o.upcoming ?? 60}:${o.results ?? 40}`;
  const hit = feedMemo.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.p;
  const p = liveFeedUncached(db, o);
  feedMemo.set(key, { at: Date.now(), p });
  p.catch(() => feedMemo.delete(key));
  return p;
}

async function liveFeedUncached(db: Db, o: { upcoming?: number; results?: number } = {}) {
  const nUp = o.upcoming ?? 60, nRes = o.results ?? 40;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const base = () => db.select({ m: matches, c: categories, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId));
  const ready = and(sql`${matches.aEntryId} is not null`, sql`${matches.bEntryId} is not null`);
  // three small, indexed-friendly queries instead of one wide scan: live now, next up, latest results
  // one row more than asked for tells the page whether a "show more" is needed
  const [live, upcomingAll, resultsAll] = await Promise.all([
    base().where(and(ready, eq(matches.live, true), eq(matches.status, 'SCHEDULED'))).limit(50),
    base().where(and(ready, eq(matches.status, 'SCHEDULED'), eq(matches.live, false), gte(matches.scheduledStart, dayStart))).orderBy(asc(matches.scheduledStart)).limit(nUp + 1),
    base().where(and(ready, sql`${matches.status} <> 'SCHEDULED'`)).orderBy(desc(sql`coalesce(${matches.scheduledStart}, ${matches.notBefore}, ${matches.updatedAt})`)).limit(nRes + 1),
  ]);
  const upcoming = upcomingAll.slice(0, nUp), results = resultsAll.slice(0, nRes);
  const ids = [...new Set([...live, ...upcoming, ...results].flatMap((r) => [r.m.aEntryId, r.m.bEntryId]).filter((x): x is string => !!x))];
  const named = ids.length
    ? await db.select({ id: entries.id, f: players.firstName, l: players.lastName }).from(entries).innerJoin(players, eq(players.id, entries.playerId)).where(inArray(entries.id, ids))
    : [];
  return { live, upcoming, results, moreUpcoming: upcomingAll.length > nUp, moreResults: resultsAll.length > nRes, names: new Map(named.map((r) => [r.id, `${r.f} ${r.l}`])) };
}

export const AGE_GROUPS = [12, 14, 16, 18] as const;

/** Junior age groups use the calendar-year age (year of the ranking date minus year of birth); U14 includes everyone aged 14 or younger. */
export function inAgeGroup(birth: Date, group: number | undefined, asOf = new Date()): boolean {
  if (!group) return true;
  return asOf.getFullYear() - birth.getFullYear() <= group;
}

/** The three counters on the home page; they move slowly, so one query per minute per instance is plenty. */
export function homeCounts(db: Db) {
  return memo('home-counts', 60_000, () => db.execute(sql`select (select count(*) from players)::int as players, (select count(*) from clubs c where exists (select 1 from players p where p.club_id = c.id) and not (c.name like '%,%' and (select count(*) from players p where p.club_id = c.id) <= 2))::int as clubs,
      (select count(*) from matches where live and status = 'SCHEDULED')::int as live`));
}
