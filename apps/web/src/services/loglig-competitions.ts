import { randomUUID } from 'node:crypto';
import { canonicalClub } from './clubs';
import { and, eq, gte, inArray, or, sql, notInArray } from 'drizzle-orm';
import { resolveCompleted, BEST_OF_3_SUPER_TB } from '@ita/rules-engine';
import { schema, type Db } from '@/db';
import { ensureDefaultRuleSet } from '@/services/rules';
import { splitName } from '@/services/loglig-rankings';
import { PLACEHOLDER_NAME, PLACEHOLDER_SQL } from '@/lib/placeholders';

type Gender = 'MALE' | 'FEMALE' | 'OPEN';
interface SetIn { a: number; b: number; superTb?: boolean }
interface PersonIn { name: string; club: string }
export interface MatchIn {
  stage: 'GROUP' | 'KO'; group?: string; round: number; place: number; order: number;
  start: string; kind: 'St' | 'NB' | ''; venue: string; done: boolean;
  a: PersonIn; b: PersonIn; sets: SetIn[]; retired: boolean; walkover: boolean;
  /** Who the source says won, when the score cannot tell (a walkover, a retirement): the Masters pages mark the winner. */
  winner?: 'a' | 'b';
}
export interface CategoryIn { name: string; source: string; gender: Gender; age: number | null; format: 'KNOCKOUT' | 'GROUPS_KNOCKOUT'; matches: MatchIn[] }
/** A doubles draw ("בנים 12 זוגות"): each side is a pair, "A / B". */
export interface BracketNode { n: string; c: BracketNode[]; t?: boolean }
export interface DoublesIn { name: string; source: string; gender: Gender; age: number | null; matches: MatchIn[]; bracket?: BracketNode }

/** The knockout tree from the sync, cleaned: names trimmed, at most two children, depth and size limited. */
function cleanBracket(x: unknown, depth = 0, count = { n: 0 }): BracketNode | null {
  const o = x as { n?: unknown; c?: unknown } | null;
  if (!o || typeof o !== 'object' || depth > 7 || ++count.n > 300) return null;
  const kids = (Array.isArray(o.c) ? o.c : []).slice(0, 2).map((k) => cleanBracket(k, depth + 1, count));
  return { n: clean(o.n, 120), c: kids.filter((k): k is BracketNode => !!k), ...(depth === 0 && (o as { t?: unknown }).t ? { t: true } : {}) };
}
/** `area` is the region or age group the venue serves ("אזור צפון"), `club` the venue. */
export interface ContactIn { area: string; club: string; name: string; phone: string }
export interface AcceptanceEvent { label: string; active: number; updated: string | null; players: { draw: string; n: number; name: string; nation: string; born: number | null; rank: string; wtn: string }[] }
export interface CompetitionIn {
  kind: 'competition'; name: string; start: string; end: string; feeShekel: number; level: 'NATIONAL' | 'REGIONAL' | 'INTERNATIONAL' | 'CIRCUIT' | 'LEAGUE';
  section?: 'YOUTH' | 'ADULTS' | 'MASTERS' | 'OTHER'; sourceUrl?: string; registerUrl?: string; registrationCloses?: string | null; venues: { club: string; address: string }[]; categories: CategoryIn[];
  /** Live refresh: only matches and results are updated, for a tournament that already exists; its fee, venue, links and deadline stay as they are. */
  resultsOnly?: boolean;
  /** Who to call at each venue ("פרטי יצירת קשר" on the federation's page): the tournament director. */
  contacts?: ContactIn[];
  /** Who is accepted so far, per event (Tennis Europe's acceptance list): shown on the tournament page. */
  acceptance?: AcceptanceEvent[];
  doubles?: DoublesIn[];
}

const MAX_MATCHES = 4000;
const clean = (s: unknown, n = 160) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const webUrl = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s]{4,500}$/.test(u) ? u : '');
// Loglig shows an unset date as 01/01/1753 (the SQL Server minimum): never a real competition or match date
const REAL_FROM = Date.parse('2000-01-01');
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Date.parse(s) >= REAL_FROM;
/** Category names the federation uses for boys/girls besides בנים/בנות ("נערים ב'", "ילדות"): never an open category. */
const genderOfName = (name: string): Gender | null => (/בנות|נשים|נערות|ילדות/.test(name) ? 'FEMALE' : /בנים|גברים|נערים|ילדים/.test(name) ? 'MALE' : null);
/** The same event under the titles of ita.co.il and of the Loglig app ("אליפות ארצית קיץ 3 2026 ע"ש זייתוני" / "ארצית קיץ 3 2026 ע"ש זייתוני"). */
const squeeze = (s: string) => s.replace(/מס[׳'’]?\.?\s/g, ' ').replace(/["'`׳״.,:\-–/]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
export function sameEvent(a: string, b: string) {
  const x = squeeze(a), y = squeeze(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // the same numbers (year, edition) on both: a generic "אליפות ישראל לנוער" is not this year's championship of that name
  const nums = (s: string) => (s.match(/\d+/g) ?? []).sort().join(',');
  return short.length >= 8 && nums(x) === nums(y) && ` ${long} `.includes(` ${short} `);
}

export function validateCompetitionImport(x: unknown): CompetitionIn {
  const b = x as Partial<CompetitionIn> | null;
  if (!b || b.kind !== 'competition' || !Array.isArray(b.categories)) throw new Error('bad payload');
  const name = clean(b.name);
  if (!name || !isDate(b.start) || !isDate(b.end)) throw new Error('bad competition');
  const cats: CategoryIn[] = [];
  let total = 0;
  for (const c of b.categories) {
    const cname = clean(c?.name, 120);
    if (!cname || !Array.isArray(c.matches)) continue;
    const matches: MatchIn[] = [];
    for (const m of c.matches) {
      const an = clean(m?.a?.name), bn = clean(m?.b?.name);
      if (!an || !bn || an.includes('/') || bn.includes('/') || PLACEHOLDER_NAME.test(an) || PLACEHOLDER_NAME.test(bn) || Number.isNaN(Date.parse(m.start))) continue;
      matches.push({
        stage: m.stage === 'GROUP' ? 'GROUP' : 'KO', ...(m.group ? { group: clean(m.group, 40) } : {}),
        round: Math.max(1, Math.min(12, Number(m.round) || 1)), place: Math.max(1, Number(m.place) || 1), order: Number(m.order) || 0,
        start: Date.parse(m.start) >= REAL_FROM ? new Date(m.start).toISOString() : `${b.start}T00:00:00.000Z`, kind: m.kind === 'NB' ? 'NB' : m.kind === 'St' ? 'St' : '', venue: clean(m.venue, 120), done: !!m.done,
        a: { name: an, club: canonicalClub(clean(m.a.club, 120)) }, b: { name: bn, club: canonicalClub(clean(m.b.club, 120)) },
        sets: (Array.isArray(m.sets) ? m.sets : []).slice(0, 5).map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0, ...(s.superTb ? { superTb: true } : {}) })),
        retired: !!m.retired, walkover: !!m.walkover, ...(m.winner === 'a' || m.winner === 'b' ? { winner: m.winner } : {}),
      });
    }
    total += matches.length;
    cats.push({
      name: cname, source: clean(c.source, 40), gender: c.gender === 'FEMALE' ? 'FEMALE' : c.gender === 'MALE' ? 'MALE' : genderOfName(cname) ?? 'OPEN',
      age: Number.isInteger(c.age) ? (c.age as number) : null, format: c.format === 'GROUPS_KNOCKOUT' ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', matches,
    });
  }
  // doubles draws: both sides are pairs ("A / B"); placeholders and singles rows are left out
  const doubles: DoublesIn[] = [];
  for (const c of Array.isArray((b as { doubles?: unknown }).doubles) ? (b as { doubles: DoublesIn[] }).doubles : []) {
    const cname = clean(c?.name, 120);
    if (!cname || !Array.isArray(c.matches)) continue;
    const ms: MatchIn[] = [];
    for (const m of c.matches) {
      const an = clean(m?.a?.name), bn = clean(m?.b?.name);
      if (!an.includes('/') || !bn.includes('/') || PLACEHOLDER_NAME.test(an) || PLACEHOLDER_NAME.test(bn) || Number.isNaN(Date.parse(m.start))) continue;
      ms.push({
        stage: m.stage === 'GROUP' ? 'GROUP' : 'KO', ...(m.group ? { group: clean(m.group, 40) } : {}), round: Math.max(1, Math.min(12, Number(m.round) || 1)), place: Math.max(1, Number(m.place) || 1), order: Number(m.order) || 0,
        start: Date.parse(m.start) >= REAL_FROM ? new Date(m.start).toISOString() : `${b.start}T00:00:00.000Z`, kind: m.kind === 'NB' ? 'NB' : m.kind === 'St' ? 'St' : '', venue: clean(m.venue, 120), done: !!m.done,
        a: { name: an, club: canonicalClub(clean(m.a.club, 120)) }, b: { name: bn, club: canonicalClub(clean(m.b.club, 120)) },
        sets: (Array.isArray(m.sets) ? m.sets : []).slice(0, 5).map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0, ...(s.superTb ? { superTb: true } : {}) })),
        retired: !!m.retired, walkover: !!m.walkover, ...(m.winner === 'a' || m.winner === 'b' ? { winner: m.winner } : {}),
      });
    }
    total += ms.length;
    const bracket = cleanBracket(c.bracket);
    if (!ms.length && !bracket?.c.length) continue;
    doubles.push({ name: cname, source: clean(c.source, 40), gender: c.gender === 'FEMALE' ? 'FEMALE' : c.gender === 'MALE' ? 'MALE' : genderOfName(cname) ?? 'OPEN', age: Number.isInteger(c.age) ? (c.age as number) : null, matches: ms, ...(bracket?.c.length ? { bracket } : {}) });
  }
  if (total > MAX_MATCHES) throw new Error('too many matches');
  const contacts: ContactIn[] = (Array.isArray(b.contacts) ? b.contacts : []).slice(0, 30)
    .map((c) => ({ area: clean(c?.area, 80), club: clean(c?.club, 120), name: clean(c?.name, 80), phone: clean(c?.phone, 30).replace(/[^\d+\-\s]/g, '').trim() }))
    .filter((c) => c.name || c.phone);
  const acceptance: AcceptanceEvent[] = (Array.isArray(b.acceptance) ? b.acceptance : []).slice(0, 12).map((a) => ({
    label: clean(a?.label, 40), active: Math.max(0, Number(a?.active) || 0), updated: typeof a?.updated === 'string' && !Number.isNaN(Date.parse(a.updated)) ? new Date(a.updated).toISOString() : null,
    players: (Array.isArray(a?.players) ? a.players : []).slice(0, 300).map((x) => ({ draw: clean(x?.draw, 30), n: Number(x?.n) || 0, name: clean(x?.name, 80), nation: clean(x?.nation, 40), born: Number.isInteger(x?.born) ? (x.born as number) : null, rank: clean(x?.rank, 12), wtn: clean(x?.wtn, 8) })).filter((x) => x.name),
  })).filter((a) => a.label && a.players.length);
  return {
    kind: 'competition', name, start: b.start as string, end: b.end as string,
    feeShekel: Math.max(0, Number(b.feeShekel) || 0),
    level: b.level === 'REGIONAL' || b.level === 'INTERNATIONAL' || b.level === 'CIRCUIT' || b.level === 'LEAGUE' ? b.level : 'NATIONAL',
    section: b.section === 'ADULTS' || b.section === 'MASTERS' || b.section === 'OTHER' ? b.section : 'YOUTH',
    sourceUrl: webUrl(b.sourceUrl), registerUrl: webUrl(b.registerUrl),
    registrationCloses: typeof b.registrationCloses === 'string' && !Number.isNaN(Date.parse(b.registrationCloses)) ? new Date(b.registrationCloses).toISOString() : null,
    venues: (Array.isArray(b.venues) ? b.venues : []).slice(0, 20).map((v) => ({ club: clean(v?.club, 120), address: clean(v?.address, 200) })).filter((v) => v.club),
    categories: cats,
    ...(contacts.length ? { contacts } : {}),
    ...(acceptance.length ? { acceptance } : {}),
    ...(doubles.length ? { doubles } : {}),
    ...(b.resultsOnly ? { resultsOnly: true } : {}),
  };
}

const wonSets = (sets: SetIn[]) => ({ a: sets.filter((s) => s.a > s.b).length, b: sets.filter((s) => s.b > s.a).length });
const games = (sets: SetIn[]) => ({
  a: sets.reduce((n, s) => n + (s.superTb ? Number(s.a > s.b) : s.a), 0), b: sets.reduce((n, s) => n + (s.superTb ? Number(s.b > s.a) : s.b), 0),
});
/** Whether the app's score rules (best of 3, match tiebreak decider) accept this result as a finished match. */
const regular = (sets: SetIn[]) => { try { resolveCompleted(sets, BEST_OF_3_SUPER_TB); return true; } catch { return false; } };

/**
 * Mirrors one public competition (all its category draws and results) into the app. Idempotent: the tournament is found by
 * name + start date and the categories it brings are rebuilt, so a re-run just refreshes scores and schedules.
 */
export async function importCompetition(db: Db, input: CompetitionIn, now = new Date()) {
  const rule = await ensureDefaultRuleSet(db);
  const year = Number(input.start.slice(0, 4));
  const start = new Date(`${input.start}T00:00:00Z`), end = new Date(`${input.end}T23:59:59Z`);
  const drawn = input.categories.some((c) => c.matches.length) || !!input.doubles?.some((c) => c.matches.length);
  const closes = input.registrationCloses ? new Date(input.registrationCloses) : null;
  // "in progress" needs something still to play (or just played): the end date alone can be stretched by one mistyped match date,
  // and a competition whose remaining matches all lie in the past is over
  const dayAgo = now.getTime() - 864e5, dayAhead = now.getTime() + 864e5;
  const everyMatch = [...input.categories.flatMap((c) => c.matches), ...(input.doubles ?? []).flatMap((c) => c.matches)];
  const active = everyMatch.some((m) => { const at = Date.parse(m.start); return m.done ? at >= dayAgo && at <= dayAhead : at >= dayAgo; });
  const status = end < now ? 'FINISHED' : !drawn ? (closes && closes > now ? 'REGISTRATION_OPEN' : 'REGISTRATION_CLOSED') : start > now ? 'DRAWN' : active ? 'IN_PROGRESS' : 'FINISHED';
  const stats = { tournament: input.name, categories: 0, players: 0, newPlayers: 0, matches: 0, doubles: 0, unresolved: 0, skipped: false };

  await (db as unknown as { transaction: <T>(f: (tx: Db) => Promise<T>) => Promise<T> }).transaction(async (tx) => {
    // venue (first listed club) and tournament
    let venueId: string | null = null;
    const v = input.venues[0];
    if (v) {
      const [found] = await tx.select().from(schema.venues).where(eq(schema.venues.name, v.club));
      venueId = found?.id ?? (await tx.insert(schema.venues).values({ name: v.club, city: v.address || null }).returning())[0]!.id;
    }
    // the same event: same name and start, else the same event under the other site's title on overlapping dates
    // (or an older import that took Loglig's empty 1753 date as its start); the existing name is kept
    const day = 864e5;
    const near = await tx.select().from(schema.tournaments).where(sql`(${schema.tournaments.startDate} <= ${new Date(end.getTime() + day).toISOString()}::timestamptz and ${schema.tournaments.endDate} >= ${new Date(start.getTime() - day).toISOString()}::timestamptz)
      or (${schema.tournaments.name} = ${input.name} and ${schema.tournaments.startDate} < ${new Date(REAL_FROM).toISOString()}::timestamptz)`);
    const existing = near.find((t) => t.name === input.name && +t.startDate === +start)
      ?? near.filter((t) => t.name === input.name || sameEvent(t.name, input.name)).sort((x, y) => Number(!!y.sourceUrl) - Number(!!x.sourceUrl))[0];
    const fields = {
      endDate: end, status: status as 'FINISHED', level: input.level, section: input.section ?? 'YOUTH', feeAgorot: Math.round(input.feeShekel * 100), venueId,
      sourceUrl: input.sourceUrl || null, registerUrl: input.registerUrl || null, registrationCloses: closes,
      // the app's lists carry no contacts: never blank what the federation's page gave
      ...(input.contacts?.length ? { contacts: input.contacts } : {}),
      // the list is replaced as a whole each run (people drop out and come in)
      ...(input.acceptance?.length ? { acceptance: input.acceptance } : {}),
    };
    let tid: string;
    if (input.resultsOnly && !existing) { stats.skipped = true; return; }
    if (existing && input.resultsOnly) { tid = existing.id; if (drawn) await tx.update(schema.tournaments).set({ status: status as 'FINISHED' }).where(eq(schema.tournaments.id, tid)); }
    else if (existing) {
      tid = existing.id;
      // a planned competition (known from the federation's Gantt) becomes the real one: its dates and name are the published ones
      const planned = existing.status === 'PLANNED';
      // Tennis Europe is the authority on its own events' dates (an organizer moves a week): the start follows it; other sources keep the start the competition was created with
      const moved = /te.tournamentsoftware.com/.test(input.sourceUrl ?? '') && +existing.startDate !== +start;
      await tx.update(schema.tournaments).set({ ...fields, ...(planned ? { name: input.name, startDate: start } : {}), ...(moved ? { startDate: start } : {}), ...(+existing.startDate < REAL_FROM ? { startDate: start } : {}) }).where(eq(schema.tournaments.id, tid)); }
    else {
      tid = (await tx.insert(schema.tournaments).values({
        name: input.name, startDate: start, ruleSetId: rule.id, format: input.categories.some((c) => c.format === 'GROUPS_KNOCKOUT') ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', ...fields,
      }).returning())[0]!.id;
    }
    // categories being refreshed are rebuilt from scratch (entries, groups, matches and draw cascade)
    if (input.categories.length) {
      await tx.delete(schema.categories).where(and(eq(schema.categories.tournamentId, tid), inArray(schema.categories.name, input.categories.map((c) => c.name))));
      // once the draws are published the competition is a mirror of Loglig: categories of an older import that are not in this one
      // (the same draw once labelled "· בית הגמר", say) would only show every match twice
      if (input.categories.some((c) => c.matches.length)) {
        await tx.delete(schema.categories).where(and(eq(schema.categories.tournamentId, tid), notInArray(schema.categories.name, input.categories.map((c) => c.name))));
      }
      // placeholder categories from an earlier run (before the draw existed) that nobody entered and that have no matches
      await tx.execute(sql`
        delete from categories c where c.tournament_id = ${tid}
          and not exists (select 1 from entries e where e.category_id = c.id and coalesce(e.source, '') <> 'loglig') and not exists (select 1 from matches m where m.category_id = c.id)
          and c.name not in (select jsonb_array_elements_text(${JSON.stringify(input.categories.map((c) => c.name))}::jsonb))`);
    }

    // results corrected by hand (where the federation's page cannot tell the winner): re-applied on every import
    const overrides = (await tx.select().from(schema.resultOverrides)).filter((o) => o.tournament === input.name || sameEvent(o.tournament, input.name));
    const overrideFor = (a: string, b: string) => overrides.find((o) => (o.playerA === a && o.playerB === b) || (o.playerA === b && o.playerB === a));

    // players already known from the ranking mirror: key rk:<G>:<birthYear>:<name> (and cp:<G>:<name> for ones created here)
    // Only the players whose name appears in this competition: a live refresh runs every few minutes and used to read the whole players table
    // (thousands of rows) just to find a few dozen names. Every string in the payload counts as a possible name (and each side of a "A / B" pair),
    // so a name that is looked up is never missing from the answer; extra strings only add nothing.
    // a two-word name typed the other way round finds the same known player (the Masters page shows first and last name swapped for some players)
    const flip = (n: string) => (n.split(' ').length === 2 ? n.split(' ').reverse().join(' ') : n);
    const wanted = new Set<string>();
    const collect = (v: unknown) => {
      if (typeof v === 'string') {
        const t = v.replace(/\s+/g, ' ').trim();
        if (t && t.length < 120) { wanted.add(t); wanted.add(flip(t)); if (t.includes('/')) for (const part of t.split('/')) { const q = part.replace(/\s+/g, ' ').trim(); if (q) { wanted.add(q); wanted.add(flip(q)); } } }
      } else if (Array.isArray(v)) for (const x of v) collect(x);
      else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x);
    };
    collect(input.categories); collect(input.doubles);
    const names = JSON.stringify([...wanted]);
    const known = await tx.select({
      id: schema.players.id, key: schema.players.logligId, first: schema.players.firstName, last: schema.players.lastName,
      gender: schema.players.gender, birth: schema.players.birthDate,
    }).from(schema.players).where(sql`(${schema.players.logligId} like 'rk:%' or ${schema.players.logligId} like 'cp:%' or ${schema.players.logligId} like 'll:%' or ${schema.players.logligId} like 'lu:%')
      and regexp_replace(${schema.players.firstName} || ' ' || ${schema.players.lastName}, '\\s+', ' ', 'g') in (select jsonb_array_elements_text(${names}::jsonb))`);
    const byName = new Map<string, { id: string; by: number | null }[]>();
    for (const k of known) {
      const nm = `${k.first} ${k.last}`.replace(/\s+/g, ' ').trim();
      const by = k.key?.startsWith('cp:') || k.key?.startsWith('lu:') ? null : k.birth.getUTCFullYear(); // created-here and roster players only have an estimated year
      const list = byName.get(`${k.gender}|${nm}`) ?? [];
      list.push({ id: k.id, by });
      byName.set(`${k.gender}|${nm}`, list);
    }
    const pickExact = (gender: Gender, name: string, age: number | null) => {
      // an open category ("A", "פתוח 30") is played by the boys and girls already known under their own gender
      const list = gender === 'OPEN' ? (['MALE', 'FEMALE', 'OPEN'] as const).map((g) => byName.get(`${g}|${name}`)).find((l) => l?.length) : byName.get(`${gender}|${name}`);
      if (!list?.length) return null;
      if (list.length === 1 || age == null) return list[0]!.id;
      const ok = list.find((x) => x.by != null && year - x.by <= age);
      return (ok ?? list[0]!).id;
    };
    const pick = (gender: Gender, name: string, age: number | null) => pickExact(gender, name, age) ?? (flip(name) !== name ? pickExact(gender, flip(name), age) : null);

    // create missing players and clubs (one batch for the whole competition)
    const missing = new Map<string, { key: string; first: string; last: string; by: number; gender: Gender; club: string }>();
    for (const c of input.categories) {
      for (const m of c.matches) {
        for (const p of [m.a, m.b]) {
          if (pick(c.gender, p.name, c.age)) continue;
          const key = `cp:${c.gender}:${p.name}`;
          if (missing.has(key)) continue;
          const n = splitName(p.name);
          missing.set(key, { key, first: n.first, last: n.last, by: year - (c.age ?? (input.section === 'ADULTS' || input.section === 'MASTERS' ? 30 : 14)), gender: c.gender, club: p.club });
        }
      }
    }
    const halves = (pair: string) => pair.split('/').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 2);
    for (const c of input.doubles ?? []) {
      for (const m of c.matches) {
        for (const side of [m.a, m.b]) {
          for (const name of halves(side.name)) {
            if (pick(c.gender, name, c.age)) continue;
            const key = `cp:${c.gender}:${name}`;
            if (missing.has(key)) continue;
            const n = splitName(name);
            missing.set(key, { key, first: n.first, last: n.last, by: year - (c.age ?? (input.section === 'ADULTS' || input.section === 'MASTERS' ? 30 : 14)), gender: c.gender, club: side.club.split('/')[0]!.trim() });
          }
        }
      }
    }
    if (missing.size) {
      const batch = JSON.stringify([...missing.values()]);
      await tx.execute(sql`
        insert into clubs (id, name)
        select gen_random_uuid()::text, c from (select distinct club as c from jsonb_to_recordset(${batch}::jsonb) as t(club text) where club <> '') x
        on conflict (name) do nothing`);
      await tx.execute(sql`
        insert into players (id, first_name, last_name, birth_date, gender, club_id, loglig_id)
        select gen_random_uuid()::text, t.first, t.last, make_date(t.by, 7, 1)::timestamptz, t.gender::gender, c.id, t.key
        from jsonb_to_recordset(${batch}::jsonb) as t(key text, first text, last text, by int, gender text, club text)
        left join clubs c on c.name = t.club
        on conflict (loglig_id) do nothing`);
      const fresh = await tx.select({ id: schema.players.id, key: schema.players.logligId }).from(schema.players)
        .where(sql`${schema.players.logligId} in (${sql.join([...missing.keys()].map((k) => sql`${k}`), sql`, `)})`);
      for (const f of fresh) {
        const m = f.key!.match(/^cp:([A-Z]+):(.+)$/)!;
        const list = byName.get(`${m[1]}|${m[2]}`) ?? [];
        list.push({ id: f.id, by: null });
        byName.set(`${m[1]}|${m[2]}`, list);
      }
      stats.newPlayers = missing.size;
    }
    // clubs of players that the ranking mirror knew without a club
    const everyone = new Set<string>();

    for (const c of input.categories) {
      const catId = randomUUID();
      const hasGroups = c.format === 'GROUPS_KNOCKOUT' && c.matches.some((m) => m.stage === 'GROUP');
      await tx.insert(schema.categories).values({
        id: catId, tournamentId: tid, name: c.name, gender: c.gender, format: c.format,
        maxBirthYear: null, minBirthYear: c.age != null ? year - c.age : null,
      });

      // entries: one per distinct player
      const entryOf = new Map<string, string>();
      const entryRows: { id: string; player: string }[] = [];
      const entryFor = (gender: Gender, p: PersonIn) => {
        const pid = pick(gender, p.name, c.age) as string;
        let eid = entryOf.get(pid);
        if (!eid) { eid = randomUUID(); entryOf.set(pid, eid); entryRows.push({ id: eid, player: pid }); everyone.add(pid); }
        return eid;
      };
      const ms = c.matches.map((m) => ({ m, a: entryFor(c.gender, m.a), b: entryFor(c.gender, m.b), id: randomUUID() }));
      if (entryRows.length) {
        await tx.execute(sql`
          insert into entries (id, category_id, player_id, status, payment_status)
          select t.id, ${catId}, t.player, 'CONFIRMED', 'PAID' from jsonb_to_recordset(${JSON.stringify(entryRows)}::jsonb) as t(id text, player text)`);
      }

      // groups and their members (a player belongs to the group of his group matches)
      const groupId = new Map<string, string>();
      if (hasGroups) {
        const names = [...new Set(c.matches.filter((m) => m.stage === 'GROUP').map((m) => m.group ?? 'בית 1'))].sort((x, y) => x.localeCompare(y, 'he', { numeric: true }));
        const rows = names.map((name, i) => ({ id: randomUUID(), name, position: i + 1 }));
        for (const r of rows) groupId.set(r.name, r.id);
        await tx.execute(sql`
          insert into groups (id, category_id, name, position)
          select t.id, ${catId}, t.name, t.position from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as t(id text, name text, position int)`);
        const member = new Map<string, string>();
        for (const x of ms) if (x.m.stage === 'GROUP') { const g = groupId.get(x.m.group ?? 'בית 1')!; member.set(x.a, g); member.set(x.b, g); }
        const mrows = [...member].map(([entry, group]) => ({ id: randomUUID(), group, entry }));
        if (mrows.length) {
          await tx.execute(sql`
            insert into group_members (id, group_id, entry_id)
            select t.id, t.group, t.entry from jsonb_to_recordset(${JSON.stringify(mrows)}::jsonb) as t(id text, "group" text, entry text)`);
        }
      }

      // who appears in a later knockout round (used to decide walkovers and retirements)
      const koMs = ms.filter((x) => x.m.stage === 'KO');
      const later = (x: (typeof ms)[number], entry: string) => koMs.some((y) => y !== x && y.m.round > x.m.round && (y.a === entry || y.b === entry));

      const counters = new Map<string, number>();
      const rows = ms.map((x) => {
        const { m } = x;
        const k = m.stage === 'GROUP' ? `G:${m.group}` : `K:${m.round}`;
        const index = counters.get(k) ?? 0;
        counters.set(k, index + 1);
        let state: 'SCHEDULED' | 'COMPLETED' | 'WALKOVER' | 'RETIRED' | 'VOID' = 'SCHEDULED';
        let winner: string | null = null, absent: string | null = null;
        if (m.done) {
          const w = wonSets(m.sets);
          const g = games(m.sets);
          if (m.winner) winner = m.winner === 'a' ? x.a : x.b;
          else if (m.sets.length && w.a !== w.b) winner = w.a > w.b ? x.a : x.b;
          else if (m.sets.length && g.a !== g.b) winner = g.a > g.b ? x.a : x.b;
          else if (later(x, x.a) !== later(x, x.b)) winner = later(x, x.a) ? x.a : x.b;
          if (m.walkover || (!m.sets.length)) {
            if (winner) { state = 'WALKOVER'; absent = winner === x.a ? x.b : x.a; } else { state = 'VOID'; stats.unresolved++; }
          } else if (m.retired) {
            if (winner) { state = 'RETIRED'; absent = winner === x.a ? x.b : x.a; } else { state = 'VOID'; stats.unresolved++; }
          } else if (winner && regular(m.sets)) state = 'COMPLETED';
          // shortened or irregular formats (one set, pro-set, unusual tiebreaks): kept as played, stored so the standings engine accepts it
          else if (winner) { state = 'RETIRED'; absent = winner === x.a ? x.b : x.a; }
          else { state = 'VOID'; stats.unresolved++; }
          const o = overrideFor(m.a.name, m.b.name);
          if (o && (o.winner === m.a.name || o.winner === m.b.name)) {
            const w = o.winner === m.a.name ? x.a : x.b;
            if (state === 'VOID') stats.unresolved--;
            winner = w;
            if (state === 'VOID' || (state === 'COMPLETED' && winner !== (wonSets(m.sets).a > wonSets(m.sets).b ? x.a : x.b))) { state = m.sets.length ? 'RETIRED' : 'WALKOVER'; absent = w === x.a ? x.b : x.a; }
            else if (state === 'RETIRED' || state === 'WALKOVER') absent = w === x.a ? x.b : x.a;
          }
        }
        return {
          id: x.id, stage: m.stage, round: m.round, index, group: m.group ? groupId.get(m.group) ?? null : null,
          a: x.a, b: x.b, status: state, sets: state === 'WALKOVER' || state === 'VOID' ? [] : m.sets, winner, absent,
          court: m.venue || null, kind: m.kind === 'NB' ? 'NOT_BEFORE' : m.kind === 'St' ? 'EXACT' : null,
          start: m.kind !== 'NB' ? m.start : null, nb: m.kind === 'NB' ? m.start : null,
        };
      });
      for (let i = 0; i < rows.length; i += 400) {
        await tx.execute(sql`
          insert into matches (id, category_id, group_id, stage, round, index, a_entry_id, b_entry_id, status, sets, winner_entry_id, absent_entry_id,
                               absent_reason, court_label, schedule_kind, scheduled_start, not_before)
          select t.id, ${catId}, t."group", t.stage, t.round, t.index, t.a, t.b, t.status::match_status, t.sets, t.winner, t.absent,
                 case when t.absent is not null then 'NO_NOTICE' end, t.court, t.kind::schedule_kind, t.start::timestamptz, t.nb::timestamptz
          from jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + 400))}::jsonb)
            as t(id text, stage text, round int, index int, "group" text, a text, b text, status text, sets jsonb, winner text, absent text, court text, kind text, start text, nb text)`);
      }

      // the published draw: players in first-round order (groups: in group order)
      const first = hasGroups ? ms.filter((x) => x.m.stage === 'GROUP').sort((p, q) => (p.m.group ?? '').localeCompare(q.m.group ?? '', 'he', { numeric: true }))
        : koMs.filter((x) => x.m.round === Math.min(...koMs.map((y) => y.m.round)) && x.m.place === 1);
      const seen = new Set<string>();
      const slots: { entryId: string | null }[] = [];
      for (const x of first) for (const e of [x.a, x.b]) if (!seen.has(e)) { seen.add(e); slots.push({ entryId: e }); }
      for (const e of entryRows.map((r) => r.id)) if (!seen.has(e)) { seen.add(e); slots.push({ entryId: e }); }
      if (rows.length) {
        await tx.insert(schema.draws).values({
          categoryId: catId, code: 0, ruleSetKey: rule.key, ruleSetVersion: rule.version, size: slots.length, slots, publishedAt: now,
        });
      }

      stats.categories++;
      stats.matches += rows.length;
    }
    // doubles draws: rebuilt like the singles (the ones this import brings, and once draws are published, only those)
    if (input.doubles?.length) {
      const names = input.doubles.map((c) => c.name);
      await tx.execute(sql`delete from doubles_matches where tournament_id = ${tid} and category in (select jsonb_array_elements_text(${JSON.stringify(names)}::jsonb))`);
      await tx.execute(sql`delete from doubles_brackets where tournament_id = ${tid} and category in (select jsonb_array_elements_text(${JSON.stringify(names)}::jsonb))`);
      for (const c of input.doubles) if (c.bracket) await tx.execute(sql`insert into doubles_brackets (tournament_id, category, tree) values (${tid}, ${c.name}, ${JSON.stringify(c.bracket)}::jsonb)`);
      if (input.doubles.some((c) => c.matches.length)) {
        await tx.execute(sql`delete from doubles_matches where tournament_id = ${tid} and category not in (select jsonb_array_elements_text(${JSON.stringify(names)}::jsonb))`);
        await tx.execute(sql`delete from doubles_brackets where tournament_id = ${tid} and category not in (select jsonb_array_elements_text(${JSON.stringify(names)}::jsonb))`);
      }
      for (const c of input.doubles) {
        const pid = (name: string) => pick(c.gender, name, c.age) ?? null;
        const ko = c.matches.filter((m) => m.stage === 'KO');
        const laterPair = (m: MatchIn, pair: string) => ko.some((y) => y !== m && y.round > m.round && y.place === 1 && m.place === 1 && (y.a.name === pair || y.b.name === pair));
        const rows = c.matches.map((m) => {
          const [a1, a2] = halves(m.a.name).map(pid), [b1, b2] = halves(m.b.name).map(pid);
          let status = 'SCHEDULED', winner: 'a' | 'b' | null = null;
          if (m.done) {
            const w = wonSets(m.sets), g = games(m.sets);
            if (m.winner) winner = m.winner;
            else if (m.sets.length && w.a !== w.b) winner = w.a > w.b ? 'a' : 'b';
            else if (m.sets.length && g.a !== g.b) winner = g.a > g.b ? 'a' : 'b';
            else if (laterPair(m, m.a.name) !== laterPair(m, m.b.name)) winner = laterPair(m, m.a.name) ? 'a' : 'b';
            status = !winner ? 'VOID' : m.walkover || !m.sets.length ? 'WALKOVER' : m.retired || !regular(m.sets) ? 'RETIRED' : 'COMPLETED';
          }
          return {
            id: randomUUID(), category: c.name, stage: m.stage, group: m.group ?? null, round: m.round, a1: a1 ?? null, a2: a2 ?? null, b1: b1 ?? null, b2: b2 ?? null,
            aName: m.a.name, bName: m.b.name, status, sets: m.sets, winner, kind: m.kind || null, start: m.start, court: m.venue || null,
          };
        });
        for (let i = 0; i < rows.length; i += 400) {
          await tx.execute(sql`
            insert into doubles_matches (id, tournament_id, category, stage, group_name, round, a1, a2, b1, b2, a_name, b_name, status, sets, winner, schedule_kind, scheduled_start, court)
            select t.id, ${tid}, t.category, t.stage, t."group", t.round, t.a1, t.a2, t.b1, t.b2, t."aName", t."bName", t.status, t.sets, t.winner, t.kind, t.start::timestamptz, t.court
            from jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + 400))}::jsonb)
              as t(id text, category text, stage text, "group" text, round int, a1 text, a2 text, b1 text, b2 text, "aName" text, "bName" text, status text, sets jsonb, winner text, kind text, start text, court text)`);
        }
        stats.doubles += rows.length;
      }
    }
    stats.players = everyone.size;
  });
  return stats;
}

/**
 * Records a result the federation's page cannot tell (who won a match retired at a tied score). Applied on the next import of
 * that competition and on every later one. A correction for the same two players in the same competition replaces the old one.
 */
export async function addResultOverride(db: Db, x: unknown) {
  const b = x as { tournament?: unknown; playerA?: unknown; playerB?: unknown; winner?: unknown; note?: unknown } | null;
  const tournament = clean(b?.tournament), a = clean(b?.playerA), bb = clean(b?.playerB), winner = clean(b?.winner), note = clean(b?.note, 300);
  if (!tournament || !a || !bb || a === bb || (winner !== a && winner !== bb)) throw new Error('bad override: the winner must be one of the two players');
  await db.execute(sql`delete from result_overrides where tournament = ${tournament}
    and ((player_a = ${a} and player_b = ${bb}) or (player_a = ${bb} and player_b = ${a}))`);
  await db.insert(schema.resultOverrides).values({ tournament, playerA: a, playerB: bb, winner, note: note || null });
  return { saved: true, tournament, winner };
}

/**
 * Removes a tournament by exact name, with everything that hangs off it (entries, matches, draws, unpaid payments, awards, follows).
 * Refuses when any entry has been paid, so real money records are never deleted by a sync call.
 */
export async function removeTournament(db: Db, name: string) {
  const found = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, name));
  if (!found.length) return { removed: 0 };
  return removeTournamentIds(db, found.map((t) => t.id));
}

/**
 * Repairs what older imports left behind: a competition stored twice under the titles of the two sites (only the copy refreshed
 * last is kept: the other one shows every match twice, the older ones with the score the wrong way round), and players created
 * by an import that no longer appear anywhere (boys and girls once stored a second time as an "open" player).
 */
export async function dedupeMirror(db: Db) {
  const ts = (await db.execute(sql`
    select t.id, t.name, t.start_date, t.end_date, t.source_url, max(d.published_at) as refreshed
    from tournaments t left join categories c on c.tournament_id = t.id left join draws d on d.category_id = c.id
    group by t.id`)) as unknown as { id: string; name: string; start_date: Date | string; end_date: Date | string; source_url: string | null; refreshed: Date | string | null }[];
  const at = (x: Date | string | null) => (x ? new Date(x).getTime() : 0);
  const newest = (x: (typeof ts)[number], y: (typeof ts)[number]) => at(y.refreshed) - at(x.refreshed) || Number(!!y.source_url) - Number(!!x.source_url);
  const gone = new Set<string>();
  for (const t of [...ts].sort(newest)) {
    if (gone.has(t.id)) continue;
    for (const o of ts) {
      if (o.id === t.id || gone.has(o.id) || !sameEvent(o.name, t.name)) continue;
      if (at(o.start_date) > at(t.end_date) + 864e5 || at(o.end_date) < at(t.start_date) - 864e5) continue;
      gone.add(o.id);
    }
  }
  let tournaments = 0;
  for (const id of gone) { try { tournaments += (await removeTournamentIds(db, [id])).removed; } catch { /* has payments: left alone */ } }
  const orphans = (await db.execute(sql`
    select p.id from players p where p.loglig_id like 'cp:%' and p.account_id is null
      and not exists (select 1 from entries e where e.player_id = p.id) and not exists (select 1 from guardians g where g.player_id = p.id)`)) as unknown as { id: string }[];
  const players = (await deletePlayersById(db, orphans.map((r) => r.id))).players;
  // players an import created while a competition still had Loglig's empty date (1753) as its year: the same estimate a new player
  // gets, from the competitions as they are now (the youngest age category played, else the first competition's year minus 14 / 30)
  const fixed = (await db.execute(sql`
    with est as (
      select e.player_id,
        max(c.min_birth_year) filter (where c.min_birth_year >= 1900) as by_cat,
        min(extract(year from t.start_date)::int - case when t.section in ('ADULTS', 'MASTERS') then 30 else 14 end) filter (where t.start_date >= '2000-01-01') as by_year
      from entries e join categories c on c.id = e.category_id join tournaments t on t.id = c.tournament_id
      group by e.player_id)
    update players p set birth_date = make_date(coalesce(est.by_cat, est.by_year), 7, 1)::timestamptz
    from est where est.player_id = p.id and p.birth_date < '1900-01-01' and p.account_id is null and coalesce(est.by_cat, est.by_year) is not null
    returning p.id`)) as unknown as unknown[];
  return { tournaments, players, births: fixed.length };
}

async function removeTournamentIds(db: Db, ids: string[]) {
  const paid = await db.execute(sql`
    select count(*)::int as n from payments p join entries e on e.id = p.entry_id join categories c on c.id = e.category_id
    where c.tournament_id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) and p.status <> 'UNPAID'`);
  if (Number((paid as unknown as { n: number }[])[0]?.n) > 0) throw new Error('tournament has payments; refusing to delete');
  await (db as unknown as { transaction: <T>(f: (tx: Db) => Promise<T>) => Promise<T> }).transaction(async (tx) => {
    const idsJson = JSON.stringify(ids);
    await tx.execute(sql`
      delete from ledger where payment_id in (select p.id from payments p join entries e on e.id = p.entry_id join categories c on c.id = e.category_id
        where c.tournament_id in (select jsonb_array_elements_text(${idsJson}::jsonb)))`);
    await tx.execute(sql`
      delete from payments where entry_id in (select e.id from entries e join categories c on c.id = e.category_id
        where c.tournament_id in (select jsonb_array_elements_text(${idsJson}::jsonb)))`);
    await tx.execute(sql`delete from points_awards where tournament_id in (select jsonb_array_elements_text(${idsJson}::jsonb))`);
    await tx.execute(sql`delete from follows where kind = 'TOURNAMENT' and target_id in (select jsonb_array_elements_text(${idsJson}::jsonb))`);
    await tx.delete(schema.tournaments).where(inArray(schema.tournaments.id, ids));
  });
  return { removed: ids.length };
}

/**
 * Doubles pairs ("A / B") and draw placeholders ("Bye Bye") that earlier imports stored as players: removes them with their entries, matches and points.
 * Players that have a user account are never touched.
 */
export async function removePairPlayers(db: Db) {
  const ids = (await db.execute(sql`
    select id from players where ((first_name || ' ' || last_name) like '%/%' or (first_name || ' ' || last_name) ~* ${PLACEHOLDER_SQL}) and account_id is null`)) as unknown as { id: string }[];
  return deletePlayersById(db, ids.map((r) => r.id));
}

/** Deletes players with their entries, matches, payments, points, follows, guardians and documents. */
export async function deletePlayersById(db: Db, playerIds: string[]) {
  if (!playerIds.length) return { players: 0, matches: 0 };
  const list = JSON.stringify(playerIds);
  let matches = 0;
  await (db as unknown as { transaction: <T>(f: (tx: Db) => Promise<T>) => Promise<T> }).transaction(async (tx) => {
    const del = (await tx.execute(sql`
      delete from matches where a_entry_id in (select id from entries where player_id in (select jsonb_array_elements_text(${list}::jsonb)))
         or b_entry_id in (select id from entries where player_id in (select jsonb_array_elements_text(${list}::jsonb))) returning id`)) as unknown as unknown[];
    matches = del.length;
    await tx.execute(sql`delete from payments where entry_id in (select id from entries where player_id in (select jsonb_array_elements_text(${list}::jsonb)))`);
    await tx.execute(sql`delete from entries where player_id in (select jsonb_array_elements_text(${list}::jsonb))`);
    await tx.execute(sql`delete from points_awards where player_id in (select jsonb_array_elements_text(${list}::jsonb))`);
    await tx.execute(sql`delete from follows where kind = 'PLAYER' and target_id in (select jsonb_array_elements_text(${list}::jsonb))`);
    await tx.execute(sql`delete from guardians where player_id in (select jsonb_array_elements_text(${list}::jsonb))`);
    await tx.execute(sql`delete from documents where player_id in (select jsonb_array_elements_text(${list}::jsonb))`);
    await tx.execute(sql`delete from players where id in (select jsonb_array_elements_text(${list}::jsonb))`);
  });
  return { players: playerIds.length, matches };
}

/** A competition from the federation's yearly Gantt: a name and dates only, until its own page or draws are published. */
export interface CalendarEventIn { name: string; start: string; end: string; level: CompetitionIn['level']; section: NonNullable<CompetitionIn['section']> }
export interface CalendarIn { kind: 'calendar'; events: CalendarEventIn[] }

export function validateCalendarImport(x: unknown): CalendarIn {
  const b = x as Partial<CalendarIn> | null;
  if (!b || b.kind !== 'calendar' || !Array.isArray(b.events)) throw new Error('bad payload');
  const events: CalendarEventIn[] = [];
  for (const e of b.events.slice(0, 400)) {
    const name = clean(e?.name, 120);
    if (!name || !isDate(e.start) || !isDate(e.end) || e.end < e.start) continue;
    events.push({
      name, start: e.start, end: e.end,
      level: e.level === 'REGIONAL' || e.level === 'INTERNATIONAL' || e.level === 'CIRCUIT' || e.level === 'LEAGUE' ? e.level : 'NATIONAL',
      section: e.section === 'ADULTS' || e.section === 'MASTERS' || e.section === 'OTHER' ? e.section : 'YOUTH',
    });
  }
  return { kind: 'calendar', events };
}

/** Words that name a kind of competition rather than one competition ("ארצית", "מוקדמות"): sharing them proves nothing. */
const GENERIC_WORDS = new Set(['ארצית', 'אזורית', 'אליפות', 'ישראל', 'לנוער', 'תחרות', 'לאומית', 'מוקדמות', 'בית', 'גמר', 'סבב', 'זוגות', 'ליגות', 'מחזור', 'מאסטרס', 'פסטיבל', 'גילאי', 'לבוגרים', 'itf', 'tennis', 'europe']);
const distinctive = (name: string) => new Set(squeeze(name).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC_WORDS.has(w)));
const DAY = 864e5;
/** The Gantt's "Tennis Europe U14" week and the tournament Tennis Europe lists for that week ("TE 14 - HAIFA", or our name for it): the same week. */
const sameTennisEuropeWeek = (r: { name: string; start: Date; end: Date }, e: CalendarEventIn) =>
  /^(tennis europe|itf)/i.test(e.name) && /^(te\b|tennis europe|itf)/i.test(r.name) && (/^itf/i.test(e.name) === /^itf/i.test(r.name)) && Math.abs(+r.start - Date.parse(`${e.start}T00:00:00Z`)) <= DAY && Math.abs(+r.end - Date.parse(`${e.end}T23:59:59Z`)) <= 2 * DAY;

/**
 * Keeps the planned competitions (status PLANNED) equal to the Gantt: adds, moves and removes them. A planned competition that a real one
 * covers (same section, nearby dates, the same event or a shared distinctive word such as "חנוכה") is dropped: the real one has the details.
 */
export async function importCalendar(db: Db, input: CalendarIn, now = new Date()) {
  const rule = await ensureDefaultRuleSet(db);
  const t = schema.tournaments;
  const today = new Date(now.getTime() - DAY);
  const events = input.events.filter((e) => new Date(`${e.end}T23:59:59Z`) >= today);
  const stats = { events: events.length, added: 0, updated: 0, removed: 0, covered: 0 };
  const from = events.reduce((m, e) => (e.start < m ? e.start : m), events[0]?.start ?? now.toISOString().slice(0, 10));
  // one small read: the planned ones (a few dozen) and what could cover a planned one
  const rows = await db.select({ id: t.id, name: t.name, start: t.startDate, end: t.endDate, status: t.status, section: t.section, level: t.level })
    .from(t).where(or(eq(t.status, 'PLANNED'), gte(t.endDate, new Date(Date.parse(`${from}T00:00:00Z`) - 7 * DAY))));
  const real = rows.filter((r) => r.status !== 'PLANNED');
  const planned = rows.filter((r) => r.status === 'PLANNED');
  const covers = (e: CalendarEventIn) => {
    const s = Date.parse(`${e.start}T00:00:00Z`), en = Date.parse(`${e.end}T23:59:59Z`), words = distinctive(e.name);
    return real.some((r) => r.section === e.section && +r.start <= en + 3 * DAY && +r.end >= s - 3 * DAY
      && (/^(tennis europe|itf)/i.test(e.name) ? sameTennisEuropeWeek(r, e) : sameEvent(r.name, e.name) || e.section === 'MASTERS' || [...distinctive(r.name)].some((w) => words.has(w))));
  };
  const wanted = events.filter((e) => (covers(e) ? (stats.covered++, false) : true));
  const key = (name: string, start: Date | string) => `${name}|${new Date(start).toISOString().slice(0, 10)}`;
  const have = new Map(planned.map((p) => [key(p.name, p.start), p]));
  const keep = new Set(wanted.map((e) => key(e.name, e.start)));
  // a planned competition that is over, moved, renamed or now covered by a real one is removed (the Gantt is the source)
  const stale = planned.filter((p) => !keep.has(key(p.name, p.start)) || +p.end < +today).map((p) => p.id);
  if (stale.length) { await db.delete(t).where(inArray(t.id, stale)); stats.removed = stale.length; }
  for (const e of wanted) {
    const fields = { endDate: new Date(`${e.end}T23:59:59Z`), level: e.level, section: e.section, status: 'PLANNED' as const };
    const existing = have.get(key(e.name, e.start));
    if (existing && +existing.end >= +today) {
      if (+existing.end !== +fields.endDate || existing.level !== e.level || existing.section !== e.section) { await db.update(t).set(fields).where(eq(t.id, existing.id)); stats.updated++; }
    } else {
      await db.insert(t).values({ name: e.name, startDate: new Date(`${e.start}T00:00:00Z`), ruleSetId: rule.id, format: 'KNOCKOUT', feeAgorot: 0, ...fields });
      stats.added++;
    }
  }
  return stats;
}
