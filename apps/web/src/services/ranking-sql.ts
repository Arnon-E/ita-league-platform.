import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import { memo, memoDelete } from '@/lib/memo';
import { ensureDefaultRuleSet, loadRuleSet } from './rules';

/**
 * The national ranking. It is computed inside the database (never shipped to the application to be added up) and stored in `ranking_snapshot`,
 * one row per ranked player: pages read a few rows from that table instead of adding up every award of the season on each visit.
 *
 * The computation reproduces `computeRanking` (packages/rules-engine) exactly: awards inside the window, each weighted as Math.round(points x
 * multiplier x 100) cents; a player's best N singles and best M doubles are summed; players are ordered by points, then by their best single
 * result, then by id (byte order, like the JavaScript comparison). test/ranking-sql.test.ts compares the two on seeded data.
 *
 * The snapshot is rebuilt (refreshRankingSnapshot) after anything that changes ranking points, by a daily cron (the 52-week window slides
 * even when nothing is entered), and by itself when a read finds it missing or older than a day.
 */
type Gender = 'MALE' | 'FEMALE';

export interface RankingTableRow { rank: number; playerId: string; name: string; club: string | null; points: number; counted: number }

const MAX_AGE_MS = 24 * 3600 * 1000;

/** The ranking window and how many results count (from the rule set; they change with a new rule set only). */
function rankParams(db: Db) {
  return memo('rank-params', 5 * 60_000, async () => {
    const rules = await loadRuleSet(db, (await ensureDefaultRuleSet(db)).id);
    return { windowWeeks: rules.ranking.windowWeeks, bestSingles: rules.ranking.bestSingles, bestDoubles: rules.ranking.bestDoubles };
  });
}

/** CTE chain `ranked(player_id, pts, best, counted, grank)` (pts and best in whole cents): everyone of this gender with a result in the window, ranked nationally. */
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

/** Rebuilds the stored ranking from the awards. One aggregation per gender, replacing the old rows in a single transaction (readers keep seeing the old table until it commits). */
export async function refreshRankingSnapshot(db: Db): Promise<{ players: number }> {
  const p = await rankParams(db);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7001)`); // two refreshes at once take turns
    await tx.execute(sql`delete from ranking_snapshot`);
    for (const g of ['MALE', 'FEMALE'] as const) {
      await tx.execute(sql`
        with ${rankedCte(g, p, now)}
        insert into ranking_snapshot (gender, player_id, rank, points_cents, best_cents, counted)
        select ${g}::gender, player_id, grank::int, pts::int, best::int, counted from ranked`);
    }
    await tx.execute(sql`insert into ranking_snapshot_meta (id, computed_at) values (1, now()) on conflict (id) do update set computed_at = excluded.computed_at`);
  });
  memoDelete('ranking-page:'); memoDelete('ranking-snapshot'); // this instance's cached pages were built from the old rows
  const n = (await db.execute(sql`select count(*)::int as n from ranking_snapshot`)) as unknown as { n: number }[];
  return { players: n[0]?.n ?? 0 };
}

/** A missing or day-old snapshot rebuilds itself (checked at most once a minute per instance), so a forgotten trigger can only make the ranking a day late. */
function ensureSnapshot(db: Db): Promise<void> {
  return memo('ranking-snapshot-fresh', 60_000, async () => {
    const m = (await db.execute(sql`select computed_at from ranking_snapshot_meta where id = 1`)) as unknown as { computed_at: string | Date }[];
    if (!m[0] || Date.now() - new Date(m[0].computed_at).getTime() > MAX_AGE_MS) await refreshRankingSnapshot(db);
  });
}

/** One page of the ranking, narrowed to an age group and/or a club (ranks are renumbered inside the narrowed list), and how many rows the whole narrowed list has. */
export function rankingPage(db: Db, o: { gender: Gender; age?: number; clubId?: string; limit?: number; offset?: number }): Promise<{ rows: RankingTableRow[]; total: number }> {
  const limit = Math.max(1, Math.min(500, Math.floor(o.limit ?? 60)));
  const offset = Math.max(0, Math.floor(o.offset ?? 0));
  return memo(`ranking-page:${o.gender}:${o.age ?? ''}:${o.clubId ?? ''}:${limit}:${offset}`, 2 * 60_000, async () => {
    await ensureSnapshot(db);
    const ageCond = o.age ? sql`and (extract(year from now() at time zone 'UTC') - extract(year from pl.birth_date at time zone 'UTC')) <= ${o.age}` : sql``;
    const clubCond = o.clubId ? sql`and pl.club_id = ${o.clubId}` : sql``;
    const rows = (await db.execute(sql`
      select rs.player_id as "playerId", pl.first_name || ' ' || pl.last_name as name, c.name as club, (rs.points_cents / 100.0)::float8 as points, rs.counted,
        (row_number() over (order by rs.rank))::int as rank, (count(*) over ())::int as total
      from ranking_snapshot rs join players pl on pl.id = rs.player_id left join clubs c on c.id = pl.club_id
      where rs.gender = ${o.gender}::gender ${ageCond} ${clubCond}
      order by rs.rank limit ${limit} offset ${offset}`)) as unknown as (RankingTableRow & { total: number })[];
    if (rows.length) return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]!.total };
    // an offset past the end returns nothing, so ask for the size of the list separately
    const t = (await db.execute(sql`
      select count(*)::int as total from ranking_snapshot rs join players pl on pl.id = rs.player_id where rs.gender = ${o.gender}::gender ${ageCond} ${clubCond}`)) as unknown as { total: number }[];
    return { rows: [], total: t[0]?.total ?? 0 };
  });
}

/** National rank and points of just these players (either gender), straight from the stored ranking: for profile cards, lists and "my home". */
export async function playerRanks(db: Db, ids: string[]): Promise<Map<string, { rank: number; points: number; counted: number }>> {
  const out = new Map<string, { rank: number; points: number; counted: number }>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  await ensureSnapshot(db);
  const list = sql.join(unique.map((i) => sql`${i}`), sql`, `);
  const rows = (await db.execute(sql`
    select player_id as "playerId", (points_cents / 100.0)::float8 as points, rank, counted from ranking_snapshot where player_id in (${list})`)) as unknown as { playerId: string; points: number; rank: number; counted: number }[];
  for (const r of rows) out.set(r.playerId, { rank: r.rank, points: r.points, counted: r.counted });
  return out;
}
