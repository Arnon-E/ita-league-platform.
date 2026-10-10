import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

export interface RankingRow {
  rank: number;
  name: string;
  birthYear: number;
  club: string;
  national: number;
  international: number;
  total: number;
}
export interface RankingImport { gender: 'MALE' | 'FEMALE'; rows: RankingRow[] }

const MAX_ROWS = 5000;

/** "ליבי אלוני אלכס" -> first "ליבי", last "אלוני אלכס". */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') || parts[0] || '' };
}

/** Stable key for a ranked player (the public table has no id): gender + birth year + full name. */
export const rankKey = (gender: string, birthYear: number, name: string) => `rk:${gender}:${birthYear}:${name.trim().replace(/\s+/g, ' ')}`;

export function validateRankingImport(x: unknown): RankingImport {
  const b = x as Partial<RankingImport> | null;
  if (!b || (b.gender !== 'MALE' && b.gender !== 'FEMALE') || !Array.isArray(b.rows)) throw new Error('bad payload');
  if (b.rows.length > MAX_ROWS) throw new Error('too many rows');
  const rows: RankingRow[] = [];
  for (const r of b.rows) {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    const birthYear = Number(r?.birthYear);
    if (!name || name.length > 120 || !Number.isInteger(birthYear) || birthYear < 1930 || birthYear > new Date().getFullYear()) continue;
    rows.push({
      rank: Number(r.rank) || 0, name, birthYear, club: String(r.club ?? '').trim().slice(0, 120),
      national: Number(r.national) || 0, international: Number(r.international) || 0, total: Number(r.total) || 0,
    });
  }
  return { gender: b.gender, rows };
}

/**
 * Mirrors the public Loglig ranking table into this app: creates clubs and players that are missing and sets each player's
 * ranking points to Loglig's total (one award per player, replaced on every run, so the import is idempotent).
 * Set-based SQL (a handful of statements) so ~1000 rows finish well inside a serverless time limit.
 */
export async function importRankings(db: Db, input: RankingImport, now = new Date()) {
  const { gender, rows } = input;
  if (!rows.length) return { players: 0, clubs: 0, awards: 0 };
  // One JSON document carries the whole batch (a JS array parameter would be expanded into a row list by the driver).
  // The public table can list the same name + birth year twice; they share one key, so keep the better row.
  const unique = new Map<string, { key: string; first: string; last: string; by: number; club: string; points: number }>();
  for (const r of rows) {
    const n = splitName(r.name);
    const key = rankKey(gender, r.birthYear, r.name);
    const prev = unique.get(key);
    if (!prev || r.total > prev.points) unique.set(key, { key, first: n.first, last: n.last, by: r.birthYear, club: r.club, points: r.total });
  }
  const batch = JSON.stringify([...unique.values()]);
  const clubCount = new Set(rows.map((r) => r.club).filter(Boolean)).size;

  await db.execute(sql`
    insert into clubs (id, name)
    select gen_random_uuid()::text, c from (select distinct club as c from jsonb_to_recordset(${batch}::jsonb) as t(club text) where club <> '') x
    on conflict (name) do nothing`);
  await db.execute(sql`
    insert into players (id, first_name, last_name, birth_date, gender, club_id, loglig_id)
    select gen_random_uuid()::text, t.first, t.last, make_date(t.by, 7, 1)::timestamptz, ${gender}::gender, c.id, t.key
    from jsonb_to_recordset(${batch}::jsonb) as t(key text, first text, last text, by int, club text, points double precision)
    left join clubs c on c.name = t.club
    on conflict (loglig_id) do update set club_id = coalesce(excluded.club_id, players.club_id)`);
  await db.execute(sql`
    delete from points_awards where loglig_key in (select key from jsonb_to_recordset(${batch}::jsonb) as t(key text))`);
  await db.execute(sql`
    insert into points_awards (id, player_id, points, multiplier, kind, date, loglig_key)
    select gen_random_uuid()::text, p.id, t.points, 1, 'singles', ${now.toISOString()}::timestamptz, t.key
    from jsonb_to_recordset(${batch}::jsonb) as t(key text, points double precision)
    join players p on p.loglig_id = t.key
    where t.points > 0`);

  return { players: rows.length, clubs: clubCount, awards: rows.filter((r) => r.total > 0).length };
}
