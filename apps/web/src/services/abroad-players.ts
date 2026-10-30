import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import type { Actor } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import type { ResultMatch } from '@/services/abroad';

/**
 * Israeli players seen at tournaments abroad (Latin names, no ids) linked to the players this site knows (Hebrew names). The match is made on the sound of the
 * name: both names are reduced to their consonants ("Ben STRAUSS" and "בן שטראוס" both become BN STRS), and only players of the right gender and an age that
 * fits the tournament's age group are looked at. One sure candidate is linked at once; anything less sure waits for the federation's approval.
 */

const HEB: Record<string, string> = {
  א: '', ע: '', ה: '', ו: '', י: '', ב: 'B', ג: 'G', ד: 'D', ז: 'C', צ: 'C', ץ: 'C', ח: 'K', כ: 'K', ך: 'K', ק: 'K', ט: 'T', ת: 'T', ל: 'L', מ: 'M', ם: 'M', נ: 'N', ן: 'N', ס: 'S', ש: 'S', פ: 'P', ף: 'P', ר: 'R',
};
const squash = (s: string) => s.replace(/(.)\1+/g, '$1');

/** The consonant skeleton of a Hebrew name ("שטראוס" -> "STRS"). */
export function hebrewKey(s: string): string {
  return squash([...s].map((c) => HEB[c] ?? '').join(''));
}

/** The same skeleton for a name written in Latin letters ("Strauss" -> "STRS", "Cohen" -> "KN"). */
export function latinKey(s: string): string {
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/sch|sh/g, 'S').replace(/tz|ts|z/g, 'C').replace(/ch|kh|ck|q|c/g, 'K').replace(/ph|f/g, 'P').replace(/th/g, 'T').replace(/v/g, 'B')
    .replace(/[aeiouyjhw]/g, '');
  return squash(t.toUpperCase());
}

/** "Ben STRAUSS" -> { first: 'Ben', last: 'STRAUSS' }; the last name is the capitals the site writes it in, else the last word. */
export function splitLatinName(full: string): { first: string; last: string } {
  const words = full.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const caps = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (caps.length && caps.length < words.length) return { first: words.filter((w) => !caps.includes(w)).join(' '), last: caps.join(' ') };
  return { first: words.slice(0, -1).join(' '), last: words.at(-1) ?? '' };
}

const distance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
};

/** 'exact' when both names have the same skeleton, 'close' when they differ by one consonant (a spelling), null otherwise. The Hebrew order of first and last is tried both ways. */
export function nameMatch(latin: string, firstHe: string, lastHe: string): 'exact' | 'close' | null {
  const { first, last } = splitLatinName(latin);
  const fk = latinKey(first), lk = latinKey(last), hf = hebrewKey(firstHe), hl = hebrewKey(lastHe);
  // a name with a consonant missing altogether, or too short to tell anyone from anyone, is not matched
  if (!fk || !lk || !hf || !hl || Math.max(fk.length + lk.length, hf.length + hl.length) < 3) return null;
  const grade = (a: string, b: string, c: string, d: string) => {
    const x = distance(a, c) + distance(b, d);
    return x === 0 ? 'exact' : x === 1 ? 'close' : null;
  };
  const straight = grade(fk, lk, hf, hl), swapped = grade(fk, lk, hl, hf);
  return straight === 'exact' || swapped === 'exact' ? 'exact' : straight ?? swapped;
}

/** The key under which a name is remembered: lower case, no accents, one space, plus the gender (the same name can be a boy and a girl). */
export const linkKey = (name: string, gender: string) => `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()}|${gender === 'FEMALE' ? 'F' : 'M'}`;

export interface SeenPlayer { name: string; gender: 'MALE' | 'FEMALE'; /** the event's year and age group: the player was born in [year - age, year - age + 3] */ year: number; age: number | null; /** when the year of birth is known (an acceptance list gives it) only that year is looked at */ born?: number | null }

/** The Israeli players of the given matches, with the gender from the draw ("BS12"/"GD14") and the event's age group. Mixed draws are skipped (no gender to go by). */
export function israelisIn(matches: ResultMatch[], year: number, age: number | null): SeenPlayer[] {
  const out = new Map<string, SeenPlayer>();
  for (const m of matches) {
    const g = /^([BG])[SD]/.exec(m.draw)?.[1];
    if (!g) continue;
    for (const s of [m.a, m.b]) s.names.forEach((name, i) => { if (s.cc[i] === 'ISR' || (s.cc.length === 1 && s.cc[0] === 'ISR')) out.set(linkKey(name, g === 'G' ? 'FEMALE' : 'MALE'), { name, gender: g === 'G' ? 'FEMALE' : 'MALE', year, age }); });
  }
  return [...out.values()];
}

/**
 * Looks up every name not seen before (or seen without any candidate more than a week ago) against the players of that gender and age, and records the outcome.
 * The candidates are read once per gender and age group, so a refresh with nothing new costs one small read of the links.
 */
export async function linkNewPlayers(db: Db, seen: SeenPlayer[], now = new Date()) {
  const stats = { checked: 0, auto: 0, pending: 0, none: 0 };
  if (!seen.length) return stats;
  const L = schema.abroadPlayerLinks, P = schema.players;
  const keys = seen.map((s) => linkKey(s.name, s.gender));
  const have = await db.select({ key: L.key, status: L.status, checkedAt: L.checkedAt }).from(L).where(inArray(L.key, keys));
  const fresh = new Map(have.filter((h) => h.status !== 'NONE' || +now - +h.checkedAt < 7 * 864e5).map((h) => [h.key, h]));
  const todo = seen.filter((s) => !fresh.has(linkKey(s.name, s.gender)));
  const groups = new Map<string, SeenPlayer[]>();
  const gk = (s: SeenPlayer) => `${s.gender}|${s.year}|${s.age ?? ''}|${s.born ?? ''}`;
  for (const s of todo) groups.set(gk(s), [...(groups.get(gk(s)) ?? []), s]);
  const rows: (typeof L.$inferInsert)[] = [];
  for (const [, list] of groups) {
    const { gender, year, age, born } = list[0]!;
    const from = born ?? year - (age ?? 18), to = born ?? year - (age ?? 18) + 3;
    const cands = await db.select({ id: P.id, first: P.firstName, last: P.lastName }).from(P)
      .where(and(eq(P.gender, gender), sql`extract(year from ${P.birthDate}) between ${from} and ${to}`));
    for (const s of list) {
      const hits = cands.map((c) => ({ id: c.id, m: nameMatch(s.name, c.first, c.last) })).filter((h): h is { id: string; m: 'exact' | 'close' } => !!h.m);
      const exact = hits.filter((h) => h.m === 'exact');
      // one exact candidate and no other, and a name long enough that the sound says something (a skeleton of three or fewer letters waits for a person)
      const { first, last } = splitLatinName(s.name);
      const sure = exact.length === 1 && hits.length === 1 && latinKey(first).length + latinKey(last).length >= 4;
      stats.checked++;
      if (sure) stats.auto++; else if (hits.length) stats.pending++; else stats.none++;
      rows.push({ key: linkKey(s.name, s.gender), name: s.name, gender, playerId: sure ? exact[0]!.id : null, status: sure ? 'AUTO' : hits.length ? 'PENDING' : 'NONE', candidates: hits.slice(0, 5).map((h) => h.id), checkedAt: now });
    }
  }
  // the same name can come from several events in one batch: one row per name (a sure link beats a pending one, which beats nobody), or the upsert meets a row twice
  const rank = { AUTO: 0, PENDING: 1, NONE: 2 } as Record<string, number>;
  const unique = [...rows.reduce((m, r) => { const old = m.get(r.key); if (!old || (rank[r.status ?? 'NONE'] ?? 2) < (rank[old.status ?? 'NONE'] ?? 2)) m.set(r.key, r); return m; }, new Map<string, (typeof rows)[number]>()).values()];
  if (unique.length) {
    await db.insert(L).values(unique).onConflictDoUpdate({
      target: L.key,
      // a link someone confirmed or rejected is never touched by the automatic pass (it only re-checks names that had no match or were never decided)
      set: { name: sql`excluded.name`, playerId: sql`excluded.player_id`, status: sql`excluded.status`, candidates: sql`excluded.candidates`, checkedAt: sql`excluded.checked_at` },
      setWhere: inArray(L.status, ['NONE', 'PENDING']),
    });
  }
  return stats;
}

/** The matches abroad of a player we know: [{ event, matches: [{ day, draw, stage, opponent, sets, won }] }], newest event first. */
export async function abroadResultsOfPlayer(db: Db, playerId: string) {
  const L = schema.abroadPlayerLinks, E = schema.abroadEvents;
  const links = await db.select({ key: L.key, name: L.name }).from(L).where(and(eq(L.playerId, playerId), inArray(L.status, ['AUTO', 'CONFIRMED'])));
  if (!links.length) return [];
  const mine = new Set(links.map((l) => l.key.split('|')[0]!));
  const events = await db.select({ id: E.id, name: E.name, city: E.city, country: E.country, start: E.startDate, end: E.endDate, results: E.results })
    .from(E).where(sql`${E.israeliNames} && array[${sql.join([...mine].map((k) => sql`${k}`), sql`, `)}]::text[]`).orderBy(sql`${E.startDate} desc`).limit(12);
  return events.map((e) => ({
    event: { id: e.id, name: e.name, city: e.city, country: e.country, start: e.start, end: e.end },
    matches: (e.results?.matches ?? []).flatMap((m) => {
      const own = (s: ResultMatch['a']) => s.names.some((n, i) => (s.cc[i] ?? s.cc[0]) === 'ISR' && mine.has(linkKey(n, 'M').split('|')[0]!));
      const a = own(m.a), b = own(m.b);
      if (!a && !b) return [];
      const me = a ? m.a : m.b, opp = a ? m.b : m.a;
      return [{ day: m.day, draw: m.draw, stage: m.stage, opponent: { names: opp.names, cc: opp.cc }, sets: m.sets.map(([x = 0, y = 0]) => (a ? [x, y] : [y, x])), won: me.won, played: me.won || opp.won }];
    }).sort((x, y) => y.day.localeCompare(x.day)),
  })).filter((e) => e.matches.length);
}

// ---- the federation's review of the names the automatic pass could not settle

export async function listAbroadLinks(db: Db, actor: Actor) {
  assertCan(actor, 'player.link');
  const L = schema.abroadPlayerLinks, P = schema.players;
  const rows = await db.select().from(L).where(inArray(L.status, ['PENDING', 'AUTO'])).orderBy(L.status, L.name).limit(200);
  const ids = [...new Set(rows.flatMap((r) => [...(r.candidates ?? []), ...(r.playerId ? [r.playerId] : [])]))];
  const people = ids.length ? await db.select({ id: P.id, first: P.firstName, last: P.lastName, birth: P.birthDate, clubId: P.clubId }).from(P).where(inArray(P.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({ link: r, candidates: (r.candidates ?? []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x), linked: r.playerId ? byId.get(r.playerId) ?? null : null }));
}

/** Confirm a name as a player, or say it is nobody we have ('REJECTED': the automatic pass leaves it alone from then on). */
export async function resolveAbroadLink(db: Db, actor: Actor, key: string, playerId: string | null) {
  assertCan(actor, 'player.link');
  const L = schema.abroadPlayerLinks;
  await db.update(L).set(playerId ? { playerId, status: 'CONFIRMED' } : { playerId: null, status: 'REJECTED' }).where(eq(L.key, key));
}

/** The Israelis of an event's acceptance list, with their year of birth and the gender from the draw ("BS12", "GD14"). */
export function israelisInAcceptance(acc: { label: string; players: { name: string; nation: string; born: number | null }[] }[], year: number, age: number | null): SeenPlayer[] {
  const out = new Map<string, SeenPlayer>();
  for (const a of acc) {
    const g = /^([BG])[SD]/.exec(a.label)?.[1];
    if (!g) continue;
    for (const p of a.players) if (/israel/i.test(p.nation)) out.set(linkKey(p.name, g === 'G' ? 'FEMALE' : 'MALE'), { name: p.name, gender: g === 'G' ? 'FEMALE' : 'MALE', year, age, born: p.born });
  }
  return [...out.values()];
}

/**
 * The Israelis accepted to an event, each with the player of this site when the name is linked ('AUTO' or 'CONFIRMED'). The links are read for the listed names only.
 */
export async function acceptedWithLinks(db: Db, acceptance: { label: string; active: number; players: { draw: string; n: number; name: string; nation: string; born: number | null; rank: string; wtn: string }[] }[]) {
  const L = schema.abroadPlayerLinks, P = schema.players;
  const keys = acceptance.flatMap((a) => { const g = /^G/.test(a.label) ? 'FEMALE' : 'MALE'; return a.players.map((p) => linkKey(p.name, g)); });
  const links = keys.length ? await db.select({ key: L.key, playerId: L.playerId }).from(L).where(and(inArray(L.key, [...new Set(keys)]), inArray(L.status, ['AUTO', 'CONFIRMED']))) : [];
  const ids = [...new Set(links.map((l) => l.playerId).filter((x): x is string => !!x))];
  const people = ids.length ? await db.select({ id: P.id, first: P.firstName, last: P.lastName, photo: P.photo }).from(P).where(inArray(P.id, ids)) : [];
  const person = new Map(links.map((l) => [l.key, people.find((p) => p.id === l.playerId) ?? null]));
  return acceptance.map((a) => {
    const g = /^G/.test(a.label) ? 'FEMALE' : 'MALE';
    return { label: a.label, active: a.active, players: a.players.map((p) => ({ ...p, player: person.get(linkKey(p.name, g)) ?? null })) };
  });
}

/** Tournaments abroad that have not ended and to which a player of this site is accepted: [{ id, name, city, country, start, end, label }]. */
export async function abroadUpcomingOfPlayer(db: Db, playerId: string) {
  const L = schema.abroadPlayerLinks, E = schema.abroadEvents;
  const links = await db.select({ key: L.key }).from(L).where(and(eq(L.playerId, playerId), inArray(L.status, ['AUTO', 'CONFIRMED'])));
  if (!links.length) return [];
  const mine = [...new Set(links.map((l) => l.key.split('|')[0]!))];
  return db.select({ id: E.id, name: E.name, city: E.city, country: E.country, start: E.startDate, end: E.endDate })
    .from(E).where(and(sql`${E.registeredNames} && array[${sql.join(mine.map((k) => sql`${k}`), sql`, `)}]::text[]`, sql`${E.endDate} >= now()`)).orderBy(E.startDate).limit(10);
}
