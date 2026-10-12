import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

const s = (x: unknown, n = 300) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const long = (x: unknown) => (typeof x === 'string' ? x.replace(/\r\n/g, '\n').trim().slice(0, 8000) : '');

export interface ClubIn {
  logligId: number; name: string; area: number; logo: string; address: string; phone: string; email: string; description: string;
  players: number; officials: { name: string; job: string }[]; teams: string[]; roster: { name: string; age: number | null }[];
}
export interface ClubsImport { kind: 'clubs'; items: ClubIn[] }
export interface SiteInfoImport { kind: 'site-info'; key: string; data: unknown }

export function validateClubsImport(x: unknown): ClubsImport {
  const b = x as Partial<ClubsImport> | null;
  if (!b || b.kind !== 'clubs' || !Array.isArray(b.items)) throw new Error('bad payload');
  const items: ClubIn[] = [];
  for (const c of b.items.slice(0, 500)) {
    const name = s(c?.name, 120);
    if (!name) continue;
    items.push({
      logligId: Number(c.logligId) || 0, name, area: Number(c.area) || 0, logo: s(c.logo, 120), address: s(c.address, 200), phone: s(c.phone, 40), email: s(c.email, 120),
      description: s(c.description, 600), players: Number(c.players) || 0,
      officials: (Array.isArray(c.officials) ? c.officials : []).slice(0, 40).map((o) => ({ name: s(o?.name, 80), job: s(o?.job, 80) })).filter((o) => o.name),
      teams: (Array.isArray(c.teams) ? c.teams : []).slice(0, 60).map((t) => s(t, 120)).filter(Boolean),
      roster: (Array.isArray(c.roster) ? c.roster : []).slice(0, 600).map((p) => ({ name: s(p?.name, 80), age: Number.isFinite(Number(p?.age)) && p?.age != null ? Number(p.age) : null })).filter((p) => p.name),
    });
  }
  return { kind: 'clubs', items };
}

const KEYS = new Set(['union', 'events', 'forms', 'sponsors', 'ages']);
export function validateSiteInfoImport(x: unknown): SiteInfoImport {
  const b = x as Partial<SiteInfoImport> | null;
  if (!b || b.kind !== 'site-info' || typeof b.key !== 'string' || !KEYS.has(b.key)) throw new Error('bad payload');
  const d = b.data as unknown;
  if (b.key === 'union') {
    const u = (d ?? {}) as Record<string, unknown>;
    return { kind: 'site-info', key: 'union', data: { description: long(u.description), about: long(u.about), regulation: long(u.regulation), statement: long(u.statement), image: s(u.image, 120) } };
  }
  if (!Array.isArray(d)) throw new Error('bad payload');
  const rows = d.slice(0, 200).map((r) => {
    const o = r as Record<string, unknown>;
    const url = typeof o.url === 'string' && /^https?:\/\//.test(o.url) ? o.url.slice(0, 600) : '';
    return { title: s(o.title, 200), description: s(o.description, 600), url, place: s(o.place, 200), start: s(o.start, 40), end: s(o.end, 40), image: s(o.image, 160), name: s(o.name, 120), id: Number(o.id) || 0 };
  });
  return { kind: 'site-info', key: b.key, data: rows };
}

/** Clubs the Loglig app lists (by area) with their contact details, officials, teams and registered players. */
export async function importClubs(db: Db, input: ClubsImport) {
  if (!input.items.length) return { clubs: 0 };
  const rows = JSON.stringify(input.items.map((c) => ({
    name: c.name, city: c.address, info: { logligId: c.logligId, area: c.area, logo: c.logo, address: c.address, phone: c.phone, email: c.email, description: c.description,
      players: c.players, officials: c.officials, teams: c.teams, roster: c.roster },
  })));
  await db.execute(sql`
    insert into clubs (id, name, city, info)
    select gen_random_uuid()::text, t.name, nullif(t.city, ''), t.info from jsonb_to_recordset(${rows}::jsonb) as t(name text, city text, info jsonb)
    on conflict (name) do update set city = coalesce(excluded.city, clubs.city), info = excluded.info`);
  return { clubs: input.items.length };
}

export async function importSiteInfo(db: Db, input: SiteInfoImport) {
  await db.execute(sql`
    insert into site_info (key, data, updated_at) values (${input.key}, ${JSON.stringify(input.data)}::jsonb, now())
    on conflict (key) do update set data = excluded.data, updated_at = now()`);
  return { key: input.key, items: Array.isArray(input.data) ? input.data.length : 1 };
}
