import postgres from 'postgres';
import type { Db } from '@/db';
import type { Actor } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import { audit } from './audit';
import { importPlayerRows, importPointRows, type ImportReport } from './imports';

/**
 * Direct import from Loglig's database (or a replica/dump restored to a database).
 * The caller supplies a read-only connection string and one SELECT per kind that aliases the source columns to:
 *   players: loglig_id, first_name, last_name, birth_date, gender, club, id_number
 *   points : loglig_id, tournament, date, points, multiplier, kind
 * Because Loglig's schema is not public, the mapping lives in the query, not in code.
 */
export function assertSingleSelect(sql: string) {
  const q = sql.trim().replace(/;+\s*$/, '');
  if (!/^select\s/i.test(q) && !/^with\s/i.test(q)) throw new Error('מותרת שאילתת SELECT בלבד');
  if (q.includes(';')) throw new Error('מותרת שאילתה אחת בלבד');
  if (/\b(insert|update|delete|drop|alter|truncate|grant|create)\b/i.test(q.replace(/'[^']*'/g, ''))) throw new Error('השאילתה כוללת פעולה אסורה');
  return q;
}

type Rows = Record<string, unknown>[];

export async function queryExternal(url: string, sql: string): Promise<Rows> {
  const q = assertSingleSelect(sql);
  if (/^postgres(ql)?:/.test(url)) {
    const c = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5, connection: { default_transaction_read_only: 'on' } as never });
    try { return (await c.begin('read only', (tx) => tx.unsafe(q))) as unknown as Rows; } finally { await c.end({ timeout: 2 }); }
  }
  if (/^mysql:/.test(url)) {
    const mysql = await import('mysql2/promise');
    const c = await mysql.createConnection({ uri: url, connectTimeout: 10000 });
    try {
      await c.query('SET SESSION TRANSACTION READ ONLY');
      const [rows] = await c.query(q);
      return rows as Rows;
    } finally { await c.end(); }
  }
  throw new Error('נתמכים חיבורי postgres:// ו-mysql:// בלבד');
}

const toStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v));
const normalise = (rows: Rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), toStr(v)])));

export async function importFromLogligDb(db: Db, actor: Actor, o: { url: string; playersSql?: string; pointsSql?: string; dryRun?: boolean }) {
  assertCan(actor, 'import.run');
  const out: { players?: ImportReport; points?: ImportReport } = {};
  if (o.playersSql?.trim()) out.players = await importPlayerRows(db, actor, normalise(await queryExternal(o.url, o.playersSql)), { dryRun: o.dryRun ?? false });
  if (o.pointsSql?.trim()) out.points = await importPointRows(db, actor, normalise(await queryExternal(o.url, o.pointsSql)), { dryRun: o.dryRun ?? false });
  await audit(db, actor, 'import.loglig-db', 'import', undefined, { dryRun: !!o.dryRun, host: new URL(o.url).host, players: out.players?.created, points: out.points?.created });
  return out;
}
