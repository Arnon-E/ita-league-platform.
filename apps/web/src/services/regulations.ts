import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

export interface RegulationIn { title: string; url: string; category: string; sort: number }
export interface RegulationsImport { kind: 'regulations'; items: RegulationIn[] }

// Only links back to the federation's own site (or its Loglig system) are accepted.
const HOSTS = /^https:\/\/(www\.)?(ita\.co\.il|loglig\.com)(:\d+)?\//;

export function validateRegulationsImport(x: unknown): RegulationsImport {
  const b = x as Partial<RegulationsImport> | null;
  if (!b || b.kind !== 'regulations' || !Array.isArray(b.items)) throw new Error('bad payload');
  const seen = new Set<string>();
  const items: RegulationIn[] = [];
  for (const r of b.items.slice(0, 500)) {
    const title = typeof r?.title === 'string' ? r.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const url = typeof r?.url === 'string' ? r.url.trim().slice(0, 1000) : '';
    if (!title || !HOSTS.test(url) || seen.has(url)) continue;
    seen.add(url);
    items.push({ title, url, category: (typeof r.category === 'string' ? r.category.trim() : '').slice(0, 80) || 'אחר', sort: Number.isFinite(Number(r.sort)) ? Number(r.sort) : 100 });
  }
  return { kind: 'regulations', items };
}

/** Replaces the published list: documents that disappeared from the federation's site are removed. */
export async function importRegulations(db: Db, input: RegulationsImport) {
  if (!input.items.length) return { items: 0 };
  const rows = JSON.stringify(input.items.map((r) => ({ ...r, id: createHash('sha1').update(r.url).digest('hex').slice(0, 24) })));
  await db.execute(sql`
    insert into regulations (id, title, url, category, sort, updated_at)
    select t.id, t.title, t.url, t.category, t.sort, now() from jsonb_to_recordset(${rows}::jsonb) as t(id text, title text, url text, category text, sort int)
    on conflict (id) do update set title = excluded.title, category = excluded.category, sort = excluded.sort, updated_at = now()`);
  await db.execute(sql`delete from regulations where id not in (select t.id from jsonb_to_recordset(${rows}::jsonb) as t(id text))`);
  return { items: input.items.length };
}
