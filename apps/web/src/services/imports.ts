import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';

const { players, clubs, pointsAwards } = schema;

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = []; let f = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; cur.push(f); f = ''; if (cur.some((x) => x.trim())) rows.push(cur); cur = []; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); if (cur.some((x) => x.trim())) rows.push(cur); }
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** One-way hash for duplicate detection. The national ID itself is never stored. */
export const hashNationalId = (id: string) => createHash('sha256').update(`${process.env.ID_HASH_SALT ?? 'ita-dev-salt'}:${id.replace(/\D/g, '')}`).digest('hex');

const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (r[k]) return r[k] as string; return ''; };
const GENDER: Record<string, 'MALE' | 'FEMALE'> = { male: 'MALE', m: 'MALE', 'זכר': 'MALE', 'בן': 'MALE', 'בנים': 'MALE', female: 'FEMALE', f: 'FEMALE', 'נקבה': 'FEMALE', 'בת': 'FEMALE', 'בנות': 'FEMALE' };

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const d = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ImportReport { created: number; updated: number; skipped: number; errors: { row: number; reason: string }[] }

/**
 * Imports players from a Loglig export (CSV). Idempotent: matched by Loglig id, else by hashed national ID.
 * Columns (English or Hebrew aliases): loglig_id, first_name, last_name, birth_date, gender, club, id_number.
 * `dryRun` validates and reports without writing.
 */
export async function importPlayersCsv(db: Db, actor: Actor, csv: string, opts: { dryRun?: boolean } = {}): Promise<ImportReport> {
  assertCan(actor, 'import.run');
  const rep: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [] };
  const rows = parseCsv(csv);
  for (const [i, r] of rows.entries()) {
    const n = i + 2;
    const first = pick(r, 'first_name', 'שם פרטי'); const last = pick(r, 'last_name', 'שם משפחה');
    const birth = parseDate(pick(r, 'birth_date', 'תאריך לידה'));
    const gender = GENDER[pick(r, 'gender', 'מין').toLowerCase()];
    if (!first || !last) { rep.errors.push({ row: n, reason: 'חסר שם' }); continue; }
    if (!birth) { rep.errors.push({ row: n, reason: 'תאריך לידה לא תקין' }); continue; }
    if (!gender) { rep.errors.push({ row: n, reason: 'מין לא תקין' }); continue; }
    const logligId = pick(r, 'loglig_id', 'מזהה לוגליג') || null;
    const idRaw = pick(r, 'id_number', 'תעודת זהות');
    const idHash = idRaw ? hashNationalId(idRaw) : null;
    const clubName = pick(r, 'club', 'מועדון');
    if (opts.dryRun) { rep.created++; continue; }
    let clubId: string | null = null;
    if (clubName) {
      await db.insert(clubs).values({ name: clubName }).onConflictDoNothing();
      clubId = ((await db.select().from(clubs).where(eq(clubs.name, clubName)))[0] as { id: string }).id;
    }
    const existing = logligId ? (await db.select().from(players).where(eq(players.logligId, logligId)))[0]
      : idHash ? (await db.select().from(players).where(eq(players.idHash, idHash)))[0] : undefined;
    const byHash = !existing && idHash ? (await db.select().from(players).where(eq(players.idHash, idHash)))[0] : undefined;
    const target = existing ?? byHash;
    if (target) {
      await db.update(players).set({ firstName: first, lastName: last, birthDate: birth, gender, clubId, ...(logligId ? { logligId } : {}), ...(idHash ? { idHash } : {}) }).where(eq(players.id, target.id));
      rep.updated++;
    } else {
      await db.insert(players).values({ firstName: first, lastName: last, birthDate: birth, gender, clubId, logligId, idHash });
      rep.created++;
    }
  }
  if (!opts.dryRun) await audit(db, actor, 'import.players', 'import', undefined, { ...rep, errors: rep.errors.length });
  return rep;
}

/** Imports historical ranking points. Idempotent per (loglig_player_id, tournament, date). Columns: loglig_id, tournament, date, points, multiplier, kind. */
export async function importPointsCsv(db: Db, actor: Actor, csv: string, opts: { dryRun?: boolean } = {}): Promise<ImportReport> {
  assertCan(actor, 'import.run');
  const rep: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const [i, r] of parseCsv(csv).entries()) {
    const n = i + 2;
    const lid = pick(r, 'loglig_id', 'מזהה לוגליג');
    const date = parseDate(pick(r, 'date', 'תאריך'));
    const points = Number(pick(r, 'points', 'נקודות'));
    if (!lid || !date || !Number.isFinite(points)) { rep.errors.push({ row: n, reason: 'שורה לא תקינה' }); continue; }
    const [p] = await db.select().from(players).where(eq(players.logligId, lid));
    if (!p) { rep.errors.push({ row: n, reason: `שחקן ${lid} לא נמצא (ייבאו שחקנים קודם)` }); continue; }
    if (opts.dryRun) { rep.created++; continue; }
    const key = `loglig:${lid}:${pick(r, 'tournament', 'תחרות')}:${date.toISOString().slice(0, 10)}`;
    const kind = pick(r, 'kind', 'סוג') === 'doubles' ? 'doubles' : 'singles';
    const mult = Number(pick(r, 'multiplier', 'מכפיל') || 1);
    const ex = await db.select().from(pointsAwards).where(eq(pointsAwards.logligKey, key));
    await db.insert(pointsAwards).values({ playerId: p.id, points, multiplier: mult, kind, date, logligKey: key }).onConflictDoUpdate({ target: pointsAwards.logligKey, set: { points, multiplier: mult, date } });
    if (ex.length) rep.updated++; else rep.created++;
  }
  if (!opts.dryRun) await audit(db, actor, 'import.points', 'import', undefined, { ...rep, errors: rep.errors.length });
  return rep;
}
