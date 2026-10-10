import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { resolveCompleted, BEST_OF_3_SUPER_TB } from '@ita/rules-engine';
import { schema, type Db } from '@/db';
import { ensureDefaultRuleSet } from '@/services/rules';
import { splitName } from '@/services/loglig-rankings';

type Gender = 'MALE' | 'FEMALE' | 'OPEN';
interface SetIn { a: number; b: number; superTb?: boolean }
interface PersonIn { name: string; club: string }
export interface MatchIn {
  stage: 'GROUP' | 'KO'; group?: string; round: number; place: number; order: number;
  start: string; kind: 'St' | 'NB' | ''; venue: string; done: boolean;
  a: PersonIn; b: PersonIn; sets: SetIn[]; retired: boolean; walkover: boolean;
}
export interface CategoryIn { name: string; source: string; gender: Gender; age: number | null; format: 'KNOCKOUT' | 'GROUPS_KNOCKOUT'; matches: MatchIn[] }
export interface CompetitionIn {
  kind: 'competition'; name: string; start: string; end: string; feeShekel: number; level: 'NATIONAL' | 'REGIONAL';
  sourceUrl?: string; venues: { club: string; address: string }[]; categories: CategoryIn[];
}

const MAX_MATCHES = 4000;
const clean = (s: unknown, n = 160) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

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
      if (!an || !bn || Number.isNaN(Date.parse(m.start))) continue;
      matches.push({
        stage: m.stage === 'GROUP' ? 'GROUP' : 'KO', ...(m.group ? { group: clean(m.group, 40) } : {}),
        round: Math.max(1, Math.min(12, Number(m.round) || 1)), place: Math.max(1, Number(m.place) || 1), order: Number(m.order) || 0,
        start: new Date(m.start).toISOString(), kind: m.kind === 'NB' ? 'NB' : m.kind === 'St' ? 'St' : '', venue: clean(m.venue, 120), done: !!m.done,
        a: { name: an, club: clean(m.a.club, 120) }, b: { name: bn, club: clean(m.b.club, 120) },
        sets: (Array.isArray(m.sets) ? m.sets : []).slice(0, 5).map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0, ...(s.superTb ? { superTb: true } : {}) })),
        retired: !!m.retired, walkover: !!m.walkover,
      });
    }
    total += matches.length;
    cats.push({
      name: cname, source: clean(c.source, 40), gender: c.gender === 'FEMALE' ? 'FEMALE' : c.gender === 'MALE' ? 'MALE' : 'OPEN',
      age: Number.isInteger(c.age) ? (c.age as number) : null, format: c.format === 'GROUPS_KNOCKOUT' ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', matches,
    });
  }
  if (total > MAX_MATCHES) throw new Error('too many matches');
  return {
    kind: 'competition', name, start: b.start as string, end: b.end as string,
    feeShekel: Math.max(0, Number(b.feeShekel) || 0), level: b.level === 'REGIONAL' ? 'REGIONAL' : 'NATIONAL',
    venues: (Array.isArray(b.venues) ? b.venues : []).slice(0, 20).map((v) => ({ club: clean(v?.club, 120), address: clean(v?.address, 200) })).filter((v) => v.club),
    categories: cats,
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
  const status = end < now ? 'FINISHED' : start <= now ? 'IN_PROGRESS' : 'DRAWN';
  const stats = { tournament: input.name, categories: 0, players: 0, newPlayers: 0, matches: 0, unresolved: 0 };

  await (db as unknown as { transaction: <T>(f: (tx: Db) => Promise<T>) => Promise<T> }).transaction(async (tx) => {
    // venue (first listed club) and tournament
    let venueId: string | null = null;
    const v = input.venues[0];
    if (v) {
      const [found] = await tx.select().from(schema.venues).where(eq(schema.venues.name, v.club));
      venueId = found?.id ?? (await tx.insert(schema.venues).values({ name: v.club, city: v.address || null }).returning())[0]!.id;
    }
    const [existing] = await tx.select().from(schema.tournaments).where(and(eq(schema.tournaments.name, input.name), eq(schema.tournaments.startDate, start)));
    const fields = { endDate: end, status: status as 'FINISHED', level: input.level, feeAgorot: Math.round(input.feeShekel * 100), venueId };
    let tid: string;
    if (existing) { tid = existing.id; await tx.update(schema.tournaments).set(fields).where(eq(schema.tournaments.id, tid)); }
    else {
      tid = (await tx.insert(schema.tournaments).values({
        name: input.name, startDate: start, ruleSetId: rule.id, format: input.categories.some((c) => c.format === 'GROUPS_KNOCKOUT') ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', ...fields,
      }).returning())[0]!.id;
    }
    // categories being refreshed are rebuilt from scratch (entries, groups, matches and draw cascade)
    if (input.categories.length) {
      await tx.delete(schema.categories).where(and(eq(schema.categories.tournamentId, tid), inArray(schema.categories.name, input.categories.map((c) => c.name))));
    }

    // players already known from the ranking mirror: key rk:<G>:<birthYear>:<name> (and cp:<G>:<name> for ones created here)
    const known = await tx.select({ id: schema.players.id, key: schema.players.logligId }).from(schema.players)
      .where(sql`${schema.players.logligId} like 'rk:%' or ${schema.players.logligId} like 'cp:%'`);
    const byName = new Map<string, { id: string; by: number | null }[]>();
    for (const k of known) {
      const m = k.key?.match(/^(?:rk:([A-Z]+):(\d{4}):|cp:([A-Z]+):)(.+)$/);
      if (!m) continue;
      const gender = m[1] ?? m[3], by = m[2] ? Number(m[2]) : null, nm = m[4]!.replace(/\s+/g, ' ');
      const list = byName.get(`${gender}|${nm}`) ?? [];
      list.push({ id: k.id, by });
      byName.set(`${gender}|${nm}`, list);
    }
    const pick = (gender: Gender, name: string, age: number | null) => {
      const list = byName.get(`${gender}|${name}`);
      if (!list?.length) return null;
      if (list.length === 1 || age == null) return list[0]!.id;
      const ok = list.find((x) => x.by != null && year - x.by <= age);
      return (ok ?? list[0]!).id;
    };

    // create missing players and clubs (one batch for the whole competition)
    const missing = new Map<string, { key: string; first: string; last: string; by: number; gender: Gender; club: string }>();
    for (const c of input.categories) {
      for (const m of c.matches) {
        for (const p of [m.a, m.b]) {
          if (pick(c.gender, p.name, c.age)) continue;
          const key = `cp:${c.gender}:${p.name}`;
          if (missing.has(key)) continue;
          const n = splitName(p.name);
          missing.set(key, { key, first: n.first, last: n.last, by: year - (c.age ?? 14), gender: c.gender, club: p.club });
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
          if (m.sets.length && w.a !== w.b) winner = w.a > w.b ? x.a : x.b;
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
        }
        return {
          id: x.id, stage: m.stage, round: m.round, index, group: m.group ? groupId.get(m.group) ?? null : null,
          a: x.a, b: x.b, status: state, sets: state === 'WALKOVER' || state === 'VOID' ? [] : m.sets, winner, absent,
          court: m.venue || null, kind: m.done ? null : m.kind === 'NB' ? 'NOT_BEFORE' : m.kind === 'St' ? 'EXACT' : null,
          start: !m.done && m.kind !== 'NB' ? m.start : null, nb: !m.done && m.kind === 'NB' ? m.start : null,
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
      await tx.insert(schema.draws).values({
        categoryId: catId, code: 0, ruleSetKey: rule.key, ruleSetVersion: rule.version, size: slots.length, slots, publishedAt: now,
      });

      stats.categories++;
      stats.matches += rows.length;
    }
    stats.players = everyone.size;
  });
  return stats;
}
