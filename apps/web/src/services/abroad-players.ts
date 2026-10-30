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

/** The sound of a name including where it has vowels: Hebrew writes few, so only י and ו count, and a vowel is just "a vowel" ("Romy" -> RVMV, "רומי" -> RVMV). */
const latinSound = (s: string) => squash(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  .replace(/sch|sh/g, 'S').replace(/tz|ts|z/g, 'C').replace(/ch|kh|ck|q|c/g, 'K').replace(/ph|f/g, 'P').replace(/th/g, 'T').replace(/v/g, 'B')
  .replace(/[aeiouy]/g, 'V').replace(/[jhw]/g, '').toUpperCase());
const hebrewSound = (s: string) => squash([...s].map((c) => (c === 'ו' || c === 'י' ? 'V' : HEB[c] ?? '')).join(''));

/** The ways a Latin name can be read: as written, and (for three words or more) first and last word only, the middle ones being often left out in Hebrew. */
const latinVariants = (latin: string) => {
  const w = latin.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return [...new Set([w.join(' '), ...(w.length > 2 ? [`${w[0]} ${w.at(-1)}`] : [])])];
};

/**
 * How well a Latin name fits a Hebrew first and last name. The whole name is compared (so "Ziv Ben Dor" fits "זיו" + "בן דור"), in either order. The grade
 * is 'exact' on the same consonants and 'close' on one consonant of difference; the score is the distance on the sound with its vowels (lower is better), which
 * tells "Romy Dor" from "רם דרור" although both have the consonants RM DR.
 */
export function nameScore(latin: string, firstHe: string, lastHe: string): { grade: 'exact' | 'close' | null; score: number } {
  let best = { d: Infinity, s: Infinity, long: 0 };
  for (const l of latinVariants(latin)) for (const h of [`${firstHe} ${lastHe}`, `${lastHe} ${firstHe}`]) {
    const lk = latinKey(l), hk = hebrewKey(h);
    if (!lk || !hk) continue;
    const d = distance(lk, hk), s = distance(latinSound(l), hebrewSound(h));
    if (d < best.d || (d === best.d && s < best.s)) best = { d, s, long: Math.max(lk.length, hk.length) };
  }
  // a name of one consonant tells nothing; a short one can be an exact match (never linked by itself: see the link rule) but not a close one
  if (best.d === Infinity || best.long < 2) return { grade: null, score: Infinity };
  return { grade: best.d === 0 ? 'exact' : best.d === 1 && best.long >= 3 ? 'close' : null, score: best.s };
}

/** 'exact' when the names have the same consonants, 'close' when they differ by one, null otherwise. */
export function nameMatch(latin: string, firstHe: string, lastHe: string): 'exact' | 'close' | null {
  return nameScore(latin, firstHe, lastHe).grade;
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
export async function linkNewPlayers(db: Db, seen: SeenPlayer[], now = new Date(), opts: { recheck?: boolean } = {}) {
  const stats: { checked: number; auto: number; pending: number; none: number; /** what became of each name (and what was already known), for the sync's log */ detail: { name: string; status: string; candidates: number; known?: boolean }[] } = { checked: 0, auto: 0, pending: 0, none: 0, detail: [] };
  if (!seen.length) return stats;
  const L = schema.abroadPlayerLinks, P = schema.players;
  const keys = seen.map((s) => linkKey(s.name, s.gender));
  const have = await db.select({ key: L.key, name: L.name, status: L.status, checkedAt: L.checkedAt, candidates: L.candidates }).from(L).where(inArray(L.key, keys));
  // names nobody decided on (pending, or nobody found) are looked at again on request, e.g. after the matching was improved
  const fresh = new Map(have.filter((h) => (opts.recheck && ['NONE', 'PENDING'].includes(h.status) ? false : h.status !== 'NONE' || +now - +h.checkedAt < 7 * 864e5)).map((h) => [h.key, h]));
  const todo = seen.filter((s) => !fresh.has(linkKey(s.name, s.gender)));
  for (const h of have) if (fresh.has(h.key)) stats.detail.push({ name: h.name, status: h.status, candidates: h.candidates?.length ?? 0, known: true });
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
      const hits = cands.map((c) => ({ id: c.id, ...nameScore(s.name, c.first, c.last) })).filter((h): h is { id: string; grade: 'exact' | 'close'; score: number } => !!h.grade).sort((x, y) => x.score - y.score);
      // sure: the best candidate has exactly the name's consonants, and the next one fits clearly worse (a couple of vowels or letters more); a name whose
      // consonants say little (three or fewer) waits for a person
      const best = hits[0];
      const sure = !!best && best.grade === 'exact' && (hits.length === 1 || hits[1]!.score - best.score >= 2) && latinKey(s.name).length >= 4;
      stats.checked++;
      if (sure) stats.auto++; else if (hits.length) stats.pending++; else stats.none++;
      stats.detail.push({ name: s.name, status: sure ? 'AUTO' : hits.length ? 'PENDING' : 'NONE', candidates: hits.length });
      rows.push({ key: linkKey(s.name, s.gender), name: s.name, gender, playerId: sure ? best!.id : null, status: sure ? 'AUTO' : hits.length ? 'PENDING' : 'NONE', candidates: hits.slice(0, 5).map((h) => h.id), checkedAt: now });
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
