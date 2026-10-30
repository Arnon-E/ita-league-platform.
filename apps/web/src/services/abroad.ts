import { and, eq, gte, inArray, lt, lte, notInArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import { memo } from '@/lib/memo';
import { israelisIn, israelisInAcceptance, linkKey, linkNewPlayers } from '@/services/abroad-players';

/** One Tennis Europe tournament outside Israel, as the sync sends it. Dates are ISO; the entry times are UTC instants. */
export interface AbroadEventIn {
  id: string; name: string; venue: string; city: string; country: string; start: string; end: string; surface: string; category: string;
  age: number | null; closed: boolean; entryOpens: string | null; entryDeadline: string | null; withdrawalDeadline: string | null;
  fee: string; hospitality: string; indoor: boolean | null; url: string;
}
/** `until`: the last start date the sync looked at; an upcoming event missing from the list up to there is removed, later ones are left alone. */
export interface AbroadIn { kind: 'abroad'; circuit: 'TE' | 'ITF'; events: AbroadEventIn[]; until: string | null }
export interface ResultSide { names: string[]; cc: string[]; won: boolean; msg: string }
export interface ResultMatch { day: string; draw: string; stage: string; court: string; time: string; a: ResultSide; b: ResultSide; sets: number[][] }
/** Matches of Israeli players at events, per event and match days: the sync sends the days it read and the matches found on them. */
export interface DrawMatch { a: { names: string[]; cc: string[]; won: boolean }; b: { names: string[]; cc: string[]; won: boolean }; sets: number[][]; date: string }
export interface ResultDraw { n: number; name: string; kind: 'KO' | 'RR'; rounds: DrawMatch[][] }
export interface AcceptanceEvent { label: string; active: number; updated: string | null; players: { draw: string; n: number; name: string; nation: string; born: number | null; rank: string; wtn: string }[] }
/** The Israelis on the acceptance lists of events (the sync keeps only them). */
export interface AbroadAcceptanceIn { kind: 'abroad-acceptance'; events: { id: string; acceptance: AcceptanceEvent[] }[]; recheck?: boolean }
export interface AbroadResultsIn { kind: 'abroad-results'; results: { id: string; days: string[]; matches: ResultMatch[]; draws?: ResultDraw[] }[] }

const clean = (s: unknown, n = 200) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const day = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Date.parse(s) >= Date.parse('2000-01-01') ? s : null);
const instant = (s: unknown) => (typeof s === 'string' && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
const link = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s]{4,300}$/.test(u) ? u : '');

export function validateAbroadImport(x: unknown): AbroadIn {
  const b = x as Partial<AbroadIn> | null;
  if (!b || b.kind !== 'abroad' || !Array.isArray(b.events)) throw new Error('bad payload');
  const seen = new Set<string>();
  const events: AbroadEventIn[] = [];
  for (const e of b.events.slice(0, 600)) {
    const id = clean(e?.id, 60).toUpperCase(), name = clean(e?.name), start = day(e?.start), end = day(e?.end);
    if (!/^[0-9A-Z][0-9A-Z-]{7,59}$/.test(id) || !name || !start || !end || end < start || seen.has(id)) continue;
    seen.add(id);
    events.push({
      id, name, venue: clean(e.venue), city: clean(e.city, 80), country: clean(e.country, 60), start, end, surface: clean(e.surface, 40), category: clean(e.category, 40),
      age: Number.isInteger(e.age) && (e.age as number) >= 8 && (e.age as number) <= 21 ? (e.age as number) : null, closed: !!e.closed,
      entryOpens: instant(e.entryOpens), entryDeadline: instant(e.entryDeadline), withdrawalDeadline: instant(e.withdrawalDeadline),
      fee: clean(e.fee, 160), hospitality: clean(e.hospitality, 400), indoor: typeof e.indoor === 'boolean' ? e.indoor : null, url: link(e.url) || (b.circuit === 'ITF' ? 'https://www.itftennis.com/en/tournament-calendar/world-tennis-tour-juniors-calendar/' : `https://te.tournamentsoftware.com/tournament/${id.toLowerCase()}`),
    });
  }
  return { kind: 'abroad', circuit: (b as { circuit?: unknown }).circuit === 'ITF' ? 'ITF' : 'TE', events, until: day((b as { until?: unknown }).until) };
}

/**
 * Keeps the table equal to Tennis Europe's list: upserts what is sent, drops upcoming events that are no longer listed (the organizer removed them) and
 * events that ended more than a week ago. One multi-row statement for the upsert, so a daily sync costs the database a handful of queries.
 */
export async function importAbroad(db: Db, input: AbroadIn, now = new Date()) {
  const t = schema.abroadEvents;
  const stats = { events: input.events.length, removed: 0 };
  if (input.events.length) {
    await db.insert(t).values(input.events.map((e) => ({
      id: e.id, name: e.name, venue: e.venue, city: e.city, country: e.country, startDate: new Date(`${e.start}T00:00:00Z`), endDate: new Date(`${e.end}T23:59:59Z`),
      surface: e.surface, category: e.category, ageGroup: e.age, circuit: input.circuit, closed: e.closed,
      entryOpens: e.entryOpens ? new Date(e.entryOpens) : null, entryDeadline: e.entryDeadline ? new Date(e.entryDeadline) : null, withdrawalDeadline: e.withdrawalDeadline ? new Date(e.withdrawalDeadline) : null,
      fee: e.fee, hospitality: e.hospitality, indoor: e.indoor, url: e.url, updatedAt: now,
    }))).onConflictDoUpdate({
      target: t.id,
      set: {
        name: sql`excluded.name`, venue: sql`excluded.venue`, city: sql`excluded.city`, country: sql`excluded.country`, startDate: sql`excluded.start_date`, endDate: sql`excluded.end_date`,
        surface: sql`excluded.surface`, category: sql`excluded.category`, ageGroup: sql`excluded.age_group`, circuit: sql`excluded.circuit`, closed: sql`excluded.closed`, entryOpens: sql`excluded.entry_opens`,
        entryDeadline: sql`excluded.entry_deadline`, withdrawalDeadline: sql`excluded.withdrawal_deadline`, fee: sql`excluded.fee`, hospitality: sql`excluded.hospitality`,
        indoor: sql`excluded.indoor`, url: sql`excluded.url`, updatedAt: sql`excluded.updated_at`,
      },
    });
    // an upcoming event inside the range the sync looked at that is not listed any more was removed by its organizer
    const until = new Date(`${input.until ?? input.events.reduce((m, e) => (e.start > m ? e.start : m), input.events[0]!.start)}T23:59:59Z`);
    const gone = await db.delete(t).where(and(eq(t.circuit, input.circuit), gte(t.startDate, now), lte(t.startDate, until), notInArray(t.id, input.events.map((e) => e.id)))).returning({ id: t.id });
    stats.removed = gone.length;
  }
  // an event with matches of Israeli players stays for good: it is part of those players' history (the lists only show the last week)
  const old = await db.delete(t).where(and(lt(t.endDate, new Date(now.getTime() - 7 * 864e5)), sql`cardinality(${t.israeliNames}) = 0`)).returning({ id: t.id });
  stats.removed += old.length;
  return stats;
}

/** Everything the page shows, shared for a minute between visitors: the next ten months and the last week (what is under way and what just finished), only the columns the cards need. */
export function abroadCatalog(db: Db) {
  return memo('abroad:catalog', 60_000, async () => {
    const t = schema.abroadEvents;
    return db.select({
      id: t.id, name: t.name, venue: t.venue, city: t.city, country: t.country, start: t.startDate, end: t.endDate, surface: t.surface, category: t.category,
      age: t.ageGroup, circuit: t.circuit, registered: t.registered, closed: t.closed, entryOpens: t.entryOpens, entryDeadline: t.entryDeadline, withdrawalDeadline: t.withdrawalDeadline, fee: t.fee, hospitality: t.hospitality, indoor: t.indoor, url: t.url,
      // how many matches of Israeli players the event has, without reading the matches themselves
      israelis: sql<number>`coalesce(jsonb_array_length(${t.results}->'matches'), 0)::int`,
    }).from(t).where(gte(t.endDate, new Date(Date.now() - 7 * 864e5))).orderBy(t.startDate).limit(600);
  });
}

/** Before the first day, under way, or over (the page lists the last week's results too). */
export const phaseOf = (e: { start: Date; end: Date }, now = new Date()): 'up' | 'live' | 'done' => (+e.end < +now ? 'done' : +e.start <= +now ? 'live' : 'up');

export type AbroadRow = Awaited<ReturnType<typeof abroadCatalog>>[number];

/** Whether a player can still sign up: entries opened and the deadline is ahead (an event with no stated deadline counts as unknown, not open). */
export function entryState(e: Pick<AbroadRow, 'entryOpens' | 'entryDeadline' | 'start'>, now = new Date()): 'open' | 'soon' | 'closed' | 'unknown' {
  if (!e.entryDeadline) return 'unknown';
  if (+e.entryDeadline < +now) return 'closed';
  if (e.entryOpens && +e.entryOpens > +now) return 'soon';
  return 'open';
}

const side = (s: unknown): ResultSide => {
  const x = s as Partial<ResultSide> | null;
  return {
    names: (Array.isArray(x?.names) ? x!.names : []).slice(0, 2).map((n) => clean(n, 80)).filter(Boolean),
    cc: (Array.isArray(x?.cc) ? x!.cc : []).slice(0, 2).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)),
    won: !!x?.won, msg: clean(x?.msg, 40),
  };
};

/** Only the matches with an Israeli player ("ISR") are kept: that is what the page is for, and it keeps each event's row small. */
export function validateAbroadResults(x: unknown): AbroadResultsIn {
  const b = x as Partial<AbroadResultsIn> | null;
  if (!b || b.kind !== 'abroad-results' || !Array.isArray(b.results)) throw new Error('bad payload');
  const results: AbroadResultsIn['results'] = [];
  for (const r of b.results.slice(0, 200)) {
    const id = clean(r?.id, 60).toUpperCase();
    if (!/^[0-9A-Z][0-9A-Z-]{7,59}$/.test(id)) continue;
    const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(day).filter((d): d is string => !!d))].slice(0, 20);
    const matches: ResultMatch[] = [];
    for (const m of (Array.isArray(r.matches) ? r.matches : []).slice(0, 400)) {
      const a = side(m?.a), bb = side(m?.b), d = day(m?.day);
      if (!d || !a.names.length || !bb.names.length || ![...a.cc, ...bb.cc].includes('ISR')) continue;
      matches.push({
        day: d, draw: clean(m.draw, 80), stage: clean(m.stage, 40), court: clean(m.court, 40), time: /^\d{1,2}:\d{2}$/.test(String(m.time)) ? String(m.time) : '', a, b: bb,
        sets: (Array.isArray(m.sets) ? m.sets : []).slice(0, 5).map((s) => (Array.isArray(s) ? [Number(s[0]) || 0, Number(s[1]) || 0] : [0, 0])),
      });
    }
    // the knockout trees of the draws that have an Israeli player: a handful of rounds of at most 64 matches
    const draws: ResultDraw[] = (Array.isArray((r as { draws?: unknown }).draws) ? (r as { draws: ResultDraw[] }).draws : []).slice(0, 12).map((d) => ({
      n: Math.max(0, Math.floor(Number(d?.n)) || 0), name: clean(d?.name, 80), kind: (d as { kind?: unknown })?.kind === 'RR' ? 'RR' as const : 'KO' as const,
      rounds: (Array.isArray(d?.rounds) ? d.rounds : []).slice(0, 8).map((round) => (Array.isArray(round) ? round : []).slice(0, 64).map((m) => {
        const s1 = side(m?.a), s2 = side(m?.b);
        return { a: { names: s1.names, cc: s1.cc, won: s1.won }, b: { names: s2.names, cc: s2.cc, won: s2.won }, sets: (Array.isArray(m?.sets) ? m.sets : []).slice(0, 5).map((s) => (Array.isArray(s) ? [Number(s[0]) || 0, Number(s[1]) || 0] : [0, 0])), date: clean(m?.date, 24) };
      })).filter((round) => round.length),
    })).filter((d) => d.name && d.rounds.length);
    results.push({ id, days, matches, ...((r as { draws?: unknown }).draws !== undefined ? { draws } : {}) });
  }
  return { kind: 'abroad-results', results };
}

export function validateAbroadAcceptance(x: unknown): AbroadAcceptanceIn {
  const b = x as Partial<AbroadAcceptanceIn> | null;
  if (!b || b.kind !== 'abroad-acceptance' || !Array.isArray(b.events)) throw new Error('bad payload');
  const events: AbroadAcceptanceIn['events'] = [];
  for (const e of b.events.slice(0, 200)) {
    const id = clean(e?.id, 60).toUpperCase();
    if (!/^[0-9A-Z][0-9A-Z-]{7,59}$/.test(id)) continue;
    const acceptance: AcceptanceEvent[] = (Array.isArray(e.acceptance) ? e.acceptance : []).slice(0, 12).map((a) => ({
      label: clean(a?.label, 40), active: Math.max(0, Number(a?.active) || 0), updated: typeof a?.updated === 'string' && !Number.isNaN(Date.parse(a.updated)) ? new Date(a.updated).toISOString() : null,
      players: (Array.isArray(a?.players) ? a.players : []).slice(0, 150).map((p) => ({ draw: clean(p?.draw, 30), n: Number(p?.n) || 0, name: clean(p?.name, 80), nation: clean(p?.nation, 40), born: Number.isInteger(p?.born) ? (p.born as number) : null, rank: clean(p?.rank, 12), wtn: clean(p?.wtn, 8) }))
        .filter((p) => p.name && /israel/i.test(p.nation)),
    })).filter((a) => a.label && a.players.length);
    events.push({ id, acceptance });
  }
  return { kind: 'abroad-acceptance', events, ...(b.recheck === true ? { recheck: true } : {}) };
}

/** The Israelis on an event's list replace what was stored; their names are looked up among the players of this site (the year of birth is known here). */
export async function importAbroadAcceptance(db: Db, input: AbroadAcceptanceIn, now = new Date()) {
  const t = schema.abroadEvents;
  const stats: { events: number; players: number; links?: Awaited<ReturnType<typeof linkNewPlayers>> } = { events: 0, players: 0 };
  if (!input.events.length) return stats;
  const have = await db.select({ id: t.id, age: t.ageGroup, start: t.startDate }).from(t).where(inArray(t.id, input.events.map((e) => e.id)));
  const info = new Map(have.map((h) => [h.id, h]));
  const rows = input.events.filter((e) => info.has(e.id)).map((e) => ({
    id: e.id, acceptance: e.acceptance, registered: e.acceptance.reduce((n, a) => n + a.players.length, 0),
    names: [...new Set(e.acceptance.flatMap((a) => a.players.map((p) => linkKey(p.name, 'M').split('|')[0]!)))],
  }));
  if (rows.length) {
    await db.execute(sql`update abroad_events a set acceptance = t.acceptance, registered = t.registered, registered_names = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(t.names) x) from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as t(id text, acceptance jsonb, registered int, names jsonb) where a.id = t.id`);
    stats.events = rows.length; stats.players = rows.reduce((n, r) => n + r.registered, 0);
    const seen = input.events.flatMap((e) => { const i = info.get(e.id); return i ? israelisInAcceptance(e.acceptance, i.start.getUTCFullYear(), i.age) : []; });
    stats.links = await linkNewPlayers(db, seen, now, { recheck: input.recheck });
  }
  return stats;
}

/** Puts the days that were read into each event's results, leaving the days that were not read as they were (the hourly refresh reads only today and yesterday). */
export async function importAbroadResults(db: Db, input: AbroadResultsIn, now = new Date()) {
  const t = schema.abroadEvents;
  const stats: { events: number; matches: number; links?: Awaited<ReturnType<typeof linkNewPlayers>> } = { events: 0, matches: 0 };
  if (!input.results.length) return stats;
  const have = await db.select({ id: t.id, results: t.results, age: t.ageGroup, start: t.startDate }).from(t).where(inArray(t.id, input.results.map((r) => r.id)));
  const byId = new Map(have.map((h) => [h.id, h.results]));
  const rows = input.results.filter((r) => byId.has(r.id)).map((r) => {
    const keep = (byId.get(r.id)?.matches ?? []).filter((m) => !r.days.includes(m.day));
    const matches = [...keep, ...r.matches].sort((x, y) => x.day.localeCompare(y.day) || x.time.localeCompare(y.time)).slice(-400);
    const days = [...new Set([...(byId.get(r.id)?.days ?? []), ...r.days])].sort();
    stats.events++; stats.matches += matches.length;
    return { id: r.id, results: { updated: now.toISOString(), days, matches, draws: r.draws ?? byId.get(r.id)?.draws ?? [] }, names: [...new Set(israelisIn(matches, 2000, null).map((p) => linkKey(p.name, p.gender).split('|')[0]!))] };
  });
  if (rows.length) {
    await db.execute(sql`update abroad_events a set results = t.results, israeli_names = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(t.names) x) from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as t(id text, results jsonb, names jsonb) where a.id = t.id`);
    // who the Israelis are: names not seen before are matched to players of this site (the event's year and age group tell which ages to look at)
    const info = new Map(have.map((h) => [h.id, h]));
    const seen = input.results.flatMap((r) => { const e = info.get(r.id); return e ? israelisIn(r.matches, e.start.getUTCFullYear(), e.age) : []; });
    Object.assign(stats, { links: await linkNewPlayers(db, seen, now) });
  }
  return stats;
}

/** One event with its Israeli players' matches (the page of a tournament under way or just finished). */
export async function abroadEvent(db: Db, id: string) {
  const [row] = await db.select().from(schema.abroadEvents).where(eq(schema.abroadEvents.id, id.toUpperCase()));
  return row ?? null;
}

export interface GroupRow { names: string[]; cc: string[]; played: number; won: number; lost: number; setsWon: number; setsLost: number; gamesWon: number; gamesLost: number }

/**
 * The table of a round robin group from its matches: everyone who appears is listed; a match counts once it has a winner. Ranked by wins, then set difference,
 * then game difference (the order Tennis Europe's own tables start with; a tie it settles by head to head is left as it falls).
 */
export function groupTable(rounds: DrawMatch[][]): GroupRow[] {
  const rows = new Map<string, GroupRow>();
  const row = (s: DrawMatch['a']) => {
    const key = s.names.join(' / ');
    if (!rows.has(key)) rows.set(key, { names: s.names, cc: s.cc, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
    return rows.get(key)!;
  };
  for (const m of rounds.flat()) {
    if (!m.a.names.length || !m.b.names.length) continue;
    const a = row(m.a), b = row(m.b);
    if (!m.a.won && !m.b.won) continue;
    a.played++; b.played++;
    (m.a.won ? a : b).won++; (m.a.won ? b : a).lost++;
    m.sets.forEach(([x = 0, y = 0], i) => {
      if (x > y) { a.setsWon++; b.setsLost++; } else if (y > x) { b.setsWon++; a.setsLost++; }
      // a deciding match tiebreak (10-8) counts as one game
      const tb = i === 2 && Math.max(x, y) >= 10;
      a.gamesWon += tb ? Number(x > y) : x; a.gamesLost += tb ? Number(y > x) : y; b.gamesWon += tb ? Number(y > x) : y; b.gamesLost += tb ? Number(x > y) : x;
    });
  }
  return [...rows.values()].sort((p, q) => q.won - p.won || (q.setsWon - q.setsLost) - (p.setsWon - p.setsLost) || (q.gamesWon - q.gamesLost) - (p.gamesWon - p.gamesLost));
}
