import { and, eq, gte, inArray, lt, lte, notInArray, sql } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import { memo } from '@/lib/memo';

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
export interface AbroadResultsIn { kind: 'abroad-results'; results: { id: string; days: string[]; matches: ResultMatch[] }[] }

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
  const old = await db.delete(t).where(lt(t.endDate, new Date(now.getTime() - 7 * 864e5))).returning({ id: t.id });
  stats.removed += old.length;
  return stats;
}

/** Everything the page shows, shared for a minute between visitors: the next ten months and the last week (what is under way and what just finished), only the columns the cards need. */
export function abroadCatalog(db: Db) {
  return memo('abroad:catalog', 60_000, async () => {
    const t = schema.abroadEvents;
    return db.select({
      id: t.id, name: t.name, venue: t.venue, city: t.city, country: t.country, start: t.startDate, end: t.endDate, surface: t.surface, category: t.category,
      age: t.ageGroup, circuit: t.circuit, closed: t.closed, entryOpens: t.entryOpens, entryDeadline: t.entryDeadline, withdrawalDeadline: t.withdrawalDeadline, fee: t.fee, hospitality: t.hospitality, indoor: t.indoor, url: t.url,
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
    results.push({ id, days, matches });
  }
  return { kind: 'abroad-results', results };
}

/** Puts the days that were read into each event's results, leaving the days that were not read as they were (the hourly refresh reads only today and yesterday). */
export async function importAbroadResults(db: Db, input: AbroadResultsIn, now = new Date()) {
  const t = schema.abroadEvents;
  const stats = { events: 0, matches: 0 };
  if (!input.results.length) return stats;
  const have = await db.select({ id: t.id, results: t.results }).from(t).where(inArray(t.id, input.results.map((r) => r.id)));
  const byId = new Map(have.map((h) => [h.id, h.results]));
  const rows = input.results.filter((r) => byId.has(r.id)).map((r) => {
    const keep = (byId.get(r.id)?.matches ?? []).filter((m) => !r.days.includes(m.day));
    const matches = [...keep, ...r.matches].sort((x, y) => x.day.localeCompare(y.day) || x.time.localeCompare(y.time)).slice(-400);
    const days = [...new Set([...(byId.get(r.id)?.days ?? []), ...r.days])].sort();
    stats.events++; stats.matches += matches.length;
    return { id: r.id, results: { updated: now.toISOString(), days, matches } };
  });
  if (rows.length) await db.execute(sql`update abroad_events a set results = t.results from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as t(id text, results jsonb) where a.id = t.id`);
  return stats;
}

/** One event with its Israeli players' matches (the page of a tournament under way or just finished). */
export async function abroadEvent(db: Db, id: string) {
  const [row] = await db.select().from(schema.abroadEvents).where(eq(schema.abroadEvents.id, id.toUpperCase()));
  return row ?? null;
}
