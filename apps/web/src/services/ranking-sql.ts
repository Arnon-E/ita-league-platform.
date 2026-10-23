import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import { memo } from '@/lib/memo';
import { ensureDefaultRuleSet, loadRuleSet } from './rules';

/**
 * The national ranking computed inside the database, so a page that shows 60 rows receives 60 rows instead of every ranking award of the
 * season. It reproduces `computeRanking` (packages/rules-engine) exactly: awards inside the window, each weighted as points x multiplier
 * rounded to 2 places; a player's best N singles and best M doubles are summed; players are ordered by points, then by their best single
 * result, then by id (byte order, like the JavaScript comparison). test/ranking-sql.test.ts compares the two on seeded data.
 */
type Gender = 'MALE' | 'FEMALE';

export interface RankingTableRow { rank: number; playerId: string; name: string; club: string | null; points: number; counted: number }

/** The ranking window and how many results count (from the rule set; a minute-scale cache is plenty, they change with a new rule set only). */
function rankParams(db: Db) {
  return memo('rank-params', 5 * 60_000, async () => {
    const rules = await loadRuleSet(db, (await ensureDefaultRuleSet(db)).id);
    return { windowWeeks: rules.ranking.windowWeeks, bestSingles: rules.ranking.bestSingles, bestDoubles: rules.ranking.bestDoubles };
  });
}

/** Weights are whole cents (Math.round(points x multiplier x 100), as in JavaScript), so sums are exact. CTE chain `ranked(player_id, pts, best, counted, grank)` (pts and best in cents): everyone of this gender with a result in the window, ranked nationally. */
function rankedCte(gender: Gender, p: { windowWeeks: number; bestSingles: number; bestDoubles: number }, asOf: Date): SQL {
  const from = new Date(asOf.getTime() - p.windowWeeks * 7 * 24 * 3600 * 1000);
  return sql`
    w as (
      select pa.player_id, (case when pa.kind = 'doubles' then 'doubles' else 'singles' end) as k, floor(pa.points * pa.multiplier * 100 + 0.5)::bigint as wp
      from points_awards pa join players pl on pl.id = pa.player_id
      where pl.gender = ${gender}::gender and pa.date >= ${from.toISOString()}::timestamptz and pa.date <= ${asOf.toISOString()}::timestamptz),
    r as (select player_id, k, wp, row_number() over (partition by player_id, k order by wp desc) as rn from w),
    agg as (
      select player_id, sum(wp)::bigint as pts, max(wp) as best, count(*)::int as counted from r
      where (k = 'singles' and rn <= ${p.bestSingles}) or (k = 'doubles' and rn <= ${p.bestDoubles}) group by player_id),
    ranked as (select a.*, row_number() over (order by a.pts desc, a.best desc, a.player_id collate "C" asc) as grank from agg a)`;
}

/** One page of the ranking, narrowed to an age group and/or a club (ranks are renumbered inside the narrowed list), and how many rows the whole narrowed list has. */
export function rankingPage(db: Db, o: { gender: Gender; age?: number; clubId?: string; limit?: number; offset?: number }): Promise<{ rows: RankingTableRow[]; total: number }> {
  const limit = Math.max(1, Math.min(500, Math.floor(o.limit ?? 60)));
  const offset = Math.max(0, Math.floor(o.offset ?? 0));
  return memo(`ranking-page:${o.gender}:${o.age ?? ''}:${o.clubId ?? ''}:${limit}:${offset}`, 2 * 60_000, async () => {
    const p = await rankParams(db);
    const now = new Date();
    const ageCond = o.age ? sql`and (extract(year from ${now.toISOString()}::timestamptz at time zone 'UTC') - extract(year from pl.birth_date at time zone 'UTC')) <= ${o.age}` : sql``;
    const clubCond = o.clubId ? sql`and pl.club_id = ${o.clubId}` : sql``;
    const rows = (await db.execute(sql`
      with ${rankedCte(o.gender, p, now)}
      select rk.player_id as "playerId", pl.first_name || ' ' || pl.last_name as name, c.name as club, (rk.pts / 100.0)::float8 as points, rk.counted,
        (row_number() over (order by rk.grank))::int as rank, (count(*) over ())::int as total
      from ranked rk join players pl on pl.id = rk.player_id left join clubs c on c.id = pl.club_id
      where true ${ageCond} ${clubCond}
      order by rk.grank limit ${limit} offset ${offset}`)) as unknown as (RankingTableRow & { total: number })[];
    if (rows.length) return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]!.total };
    // an offset past the end returns nothing, so ask for the size of the list separately
    const t = (await db.execute(sql`
      with ${rankedCte(o.gender, p, now)}
      select count(*)::int as total from ranked rk join players pl on pl.id = rk.player_id where true ${ageCond} ${clubCond}`)) as unknown as { total: number }[];
    return { rows: [], total: t[0]?.total ?? 0 };
  });
}

/** National rank and points of just these players (both genders), without shipping the table: for profile cards, lists and "my home". */
export async function playerRanks(db: Db, ids: string[]): Promise<Map<string, { rank: number; points: number; counted: number }>> {
  const out = new Map<string, { rank: number; points: number; counted: number }>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const p = await rankParams(db);
  const now = new Date();
  const list = sql.join(unique.map((i) => sql`${i}`), sql`, `);
  for (const g of ['MALE', 'FEMALE'] as const) {
    const rows = (await db.execute(sql`
      with ${rankedCte(g, p, now)}
      select player_id as "playerId", (pts / 100.0)::float8 as points, grank::int as rank, counted from ranked where player_id in (${list})`)) as unknown as { playerId: string; points: number; rank: number; counted: number }[];
    for (const r of rows) out.set(r.playerId, { rank: r.rank, points: r.points, counted: r.counted });
  }
  return out;
}
