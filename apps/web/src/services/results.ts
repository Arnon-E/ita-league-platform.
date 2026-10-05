import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  advancers, computeStandings, resolveCompleted, roundName,
  type MatchFormat, type MatchResult, type SetScore, type Standing, type GroupConfig,
} from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { loadRuleSet } from './rules';
import { roundKey, type PointsTable } from './rankings';
import { scopeFor } from './tournaments';
import { DEFAULT_GROUP_CONFIG, formatOf, insertKnockoutMatches, type StoredSlot } from './draws';
import { makeDraw } from '@ita/rules-engine';

const { matches, categories, tournaments, entries, players, groups, groupMembers, draws, drawLogs, pointsAwards } = schema;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Placeholder values: ITA points tables must be configured by the federation. */
export const DEFAULT_POINTS: PointsTable = { W: 100, F: 70, SF: 50, QF: 35, R16: 20, R32: 12, R64: 6, R128: 3, G: 5 };

export interface ResultInput {
  status: 'COMPLETED' | 'WALKOVER' | 'RETIRED';
  sets?: SetScore[];
  /** The player who did not show up (walkover) or retired. */
  absentEntryId?: string;
  /** Why the player was absent / retired. Decides ranking points and discipline (ITA youth procedures 6.4-6.6). */
  reason?: 'NO_NOTICE' | 'NOTICE' | 'NOTICE_MEDICAL' | 'INJURY' | 'NON_INJURY';
}

const fmtOf = (t: { setsToWin: number; decider: string }): MatchFormat => ({ setsToWin: t.setsToWin, decider: t.decider === 'set' ? 'set' : 'superTb' });

async function loadMatch(db: Db | Tx, matchId: string) {
  const [row] = await db.select({ m: matches, c: categories, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId))
    .where(eq(matches.id, matchId));
  if (!row) throw new Error('Match not found');
  return row;
}

/** Clears a KO match and everything that depended on it (recursively). */
async function clearFrom(tx: Db | Tx, categoryId: string, round: number, index: number) {
  const nextRound = round + 1;
  const nextIndex = Math.floor(index / 2);
  const [next] = await tx.select().from(matches).where(and(eq(matches.categoryId, categoryId), eq(matches.stage, 'KO'), eq(matches.round, nextRound), eq(matches.index, nextIndex)));
  if (!next) return;
  await tx.update(matches).set({
    ...(index % 2 === 0 ? { aEntryId: null } : { bEntryId: null }),
    status: 'SCHEDULED', sets: [], winnerEntryId: null, absentEntryId: null,
  }).where(eq(matches.id, next.id));
  await clearFrom(tx, categoryId, nextRound, nextIndex);
}

async function propagate(tx: Db | Tx, categoryId: string, round: number, index: number, winner: string) {
  const [next] = await tx.select().from(matches).where(and(eq(matches.categoryId, categoryId), eq(matches.stage, 'KO'), eq(matches.round, round + 1), eq(matches.index, Math.floor(index / 2))));
  if (!next) return;
  await tx.update(matches).set(index % 2 === 0 ? { aEntryId: winner } : { bEntryId: winner }).where(eq(matches.id, next.id));
}

/**
 * Records or corrects a result. Quick entry: sets for a normal finish, or walkover/retired with the absent player.
 * Correcting an existing result needs `result.override`; if the winner changes, later rounds are cleared.
 */
export async function recordResult(db: Db, actor: Actor, matchId: string, input: ResultInput) {
  const { m, c, t } = await loadMatch(db, matchId);
  const scope = await scopeFor(db, actor, t.id);
  assertCan(actor, 'result.enter', scope);
  if (!['DRAWN', 'IN_PROGRESS'].includes(t.status)) throw new Error('אי אפשר להזין תוצאות במצב התחרות הנוכחי');
  if (!m.aEntryId || !m.bEntryId) throw new Error('המשחק עדיין לא מוכן: חסר שחקן');
  const correcting = m.status !== 'SCHEDULED';
  if (correcting) assertCan(actor, 'result.override', scope);

  const sets = input.sets ?? [];
  let winner: string;
  if (input.status === 'COMPLETED') {
    const out = resolveCompleted(sets, fmtOf(t));
    winner = out.winner === 'a' ? m.aEntryId : m.bEntryId;
  } else {
    if (!input.absentEntryId || ![m.aEntryId, m.bEntryId].includes(input.absentEntryId)) throw new Error('נדרש לציין מי נעדר/פרש');
    if (input.status === 'WALKOVER' && sets.length) throw new Error('בווק-אובר אין תוצאה');
    winner = input.absentEntryId === m.aEntryId ? m.bEntryId : m.aEntryId;
  }

  await db.transaction(async (tx) => {
    if (m.stage === 'KO' && m.winnerEntryId && m.winnerEntryId !== winner) await clearFrom(tx, m.categoryId, m.round, m.index);
    await tx.update(matches).set({
      status: input.status, sets: sets as never, winnerEntryId: winner, absentEntryId: input.absentEntryId ?? null,
      absentReason: input.status === 'COMPLETED' ? null : (input.reason ?? (input.status === 'WALKOVER' ? 'NOTICE' : 'NON_INJURY')),
      updatedAt: new Date(), updatedById: actor.id,
    }).where(eq(matches.id, matchId));
    if (m.stage === 'KO') await propagate(tx, m.categoryId, m.round, m.index, winner);
    if (t.status === 'DRAWN') await tx.update(tournaments).set({ status: 'IN_PROGRESS' }).where(eq(tournaments.id, t.id));
  });
  await audit(db, actor, correcting ? 'result.correct' : 'result.enter', 'match', matchId, { status: input.status, sets, winner, category: c.name });
  return { winnerEntryId: winner };
}

export interface GroupTable { groupId: string; name: string; standings: Standing[] }

export async function groupStandings(db: Db, categoryId: string): Promise<GroupTable[]> {
  const [row] = await db.select({ c: categories, t: tournaments }).from(categories).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(categories.id, categoryId));
  if (!row) throw new Error('Category not found');
  const rules = await loadRuleSet(db, row.t.ruleSetId);
  const [d] = await db.select().from(draws).where(eq(draws.categoryId, categoryId));
  const gs = await db.select().from(groups).where(eq(groups.categoryId, categoryId)).orderBy(groups.position);
  const out: GroupTable[] = [];
  for (const g of gs) {
    const mem = await db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id));
    const ms = await db.select().from(matches).where(eq(matches.groupId, g.id));
    const results: MatchResult[] = ms.filter((x) => x.aEntryId && x.bEntryId && x.status !== 'SCHEDULED' && x.status !== 'VOID').map((x) => ({
      id: x.id, a: x.aEntryId as string, b: x.bEntryId as string, status: x.status.toLowerCase() as MatchResult['status'],
      sets: x.sets as SetScore[], ...(x.absentEntryId ? { absent: x.absentEntryId } : {}),
    }));
    const standings = computeStandings(mem.map((x) => x.entryId), results, rules, fmtOf(row.t), {
      drawCode: d?.code ?? 1, withdrawn: mem.filter((x) => x.withdrawn).map((x) => x.entryId),
    });
    out.push({ groupId: g.id, name: g.name, standings });
  }
  return out;
}

/** After the group stage: the top finishers are drawn into a knockout bracket (group winners seeded, same-group players kept apart in round 1 when possible). */
export async function advanceToKnockout(db: Db, actor: Actor, categoryId: string, opts: { force?: boolean } = {}) {
  const [row] = await db.select({ c: categories, t: tournaments }).from(categories).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(categories.id, categoryId));
  if (!row) throw new Error('Category not found');
  const { c, t } = row;
  assertCan(actor, 'draw.run', await scopeFor(db, actor, t.id));
  if (formatOf(c, t) !== 'GROUPS_KNOCKOUT') throw new Error('הקטגוריה אינה בפורמט בתים + הדחה');
  const [d] = await db.select().from(draws).where(eq(draws.categoryId, categoryId));
  if (!d) throw new Error('לא בוצעה הגרלה');
  if (d.koSlots) throw new Error('שלב ההדחה כבר נוצר');
  const open = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.categoryId, categoryId), eq(matches.stage, 'GROUP'), eq(matches.status, 'SCHEDULED')));
  if (open.length && !opts.force) throw new Error(`נותרו ${open.length} משחקי בתים ללא תוצאה`);

  const rules = await loadRuleSet(db, t.ruleSetId);
  const cfg = (c.groupConfig as GroupConfig | null) ?? DEFAULT_GROUP_CONFIG;
  const tables = await groupStandings(db, categoryId);
  const withdrawn = new Set((await db.select().from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(and(eq(groups.categoryId, categoryId), eq(groupMembers.withdrawn, true)))).map((r) => r.group_members.entryId));
  const clean = tables.map((g) => g.standings.filter((s) => !withdrawn.has(s.id)));
  const qualified = advancers(clean, cfg.advancers);
  if (qualified.length < 2) throw new Error('אין מספיק שחקנים שעולים לשלב ההדחה');

  const groupOf = new Map<string, number>();
  clean.forEach((g, gi) => g.forEach((s) => groupOf.set(s.id, gi)));
  // rank for the KO draw: all group winners first, then runners-up, ... ties inside a place keep group order
  const ranked = clean.flatMap((g) => g.slice(0, cfg.advancers).map((s, place) => ({ id: s.id, place, gi: groupOf.get(s.id) as number })));
  ranked.sort((x, y) => x.place - y.place || x.gi - y.gi);
  const entrants = ranked.map((r, i) => ({ id: r.id, name: r.id, rank: i + 1, club: `g${r.gi}` }));

  let chosen = makeDraw(entrants, { code: d.code, ruleSet: rules, seeds: tables.length });
  const clash = (dr: typeof chosen) => {
    let n = 0;
    for (let i = 0; i < dr.slots.length; i += 2) {
      const a = dr.slots[i]; const b = dr.slots[i + 1];
      if (a?.kind === 'player' && b?.kind === 'player' && groupOf.get(a.player.id) === groupOf.get(b.player.id)) n++;
    }
    return n;
  };
  let koCode = d.code;
  for (let k = 1; k <= 300 && clash(chosen) > 0; k++) {
    koCode = d.code + k;
    chosen = makeDraw(entrants, { code: koCode, ruleSet: rules, seeds: tables.length, separateClubs: true });
  }
  const koSlots: StoredSlot[] = chosen.slots.map((s) => (s.kind === 'bye' ? { entryId: null } : { entryId: s.player.id, ...(s.seed ? { seed: s.seed } : {}) }));
  await db.transaction(async (tx) => {
    await insertKnockoutMatches(tx, categoryId, koSlots);
    await tx.update(draws).set({ koSlots, koCode }).where(eq(draws.id, d.id));
    await tx.insert(drawLogs).values({ drawId: d.id, userId: actor.id, action: 'KO', detail: { koCode, qualified: qualified.length, clashes: clash(chosen) } });
  });
  await audit(db, actor, 'draw.advance', 'category', categoryId, { koCode, qualified: qualified.length });
  return { qualified: qualified.length, koCode };
}

/**
 * Awards ranking points for a category from the round each player reached.
 * Idempotent (keyed by tournament/category/player). A player who loses by walkover gets 0.
 */
export async function awardPoints(db: Db, actor: Actor, categoryId: string, tableOverride?: PointsTable, multiplier = 1) {
  const [row] = await db.select({ c: categories, t: tournaments }).from(categories).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(categories.id, categoryId));
  if (!row) throw new Error('Category not found');
  const { c, t } = row;
  assertCan(actor, 'ranking.recalculate', await scopeFor(db, actor, t.id));
  const rs = await loadRuleSet(db, t.ruleSetId);
  const table = tableOverride ?? (t.pointsTableKey !== 'DEFAULT' ? rs.pointsTables?.[t.pointsTableKey] : undefined) ?? rs.points;
  const ms = await db.select().from(matches).where(eq(matches.categoryId, categoryId));
  const ko = ms.filter((m) => m.stage === 'KO');
  const maxRound = ko.reduce((x, m) => Math.max(x, m.round), 0);
  const reached = new Map<string, string>(); // entryId -> key
  const zero = new Set<string>();
  const flagged: string[] = [];
  const absences: { entry: string; reason: string; round: number }[] = [];

  for (const m of ms.filter((x) => x.stage === 'GROUP')) {
    for (const e of [m.aEntryId, m.bEntryId]) if (e && !reached.has(e)) reached.set(e, 'G');
  }
  for (const m of ko.sort((a, b) => a.round - b.round)) {
    for (const e of [m.aEntryId, m.bEntryId]) if (e) reached.set(e, roundKey(maxRound - m.round));
    if (m.absentEntryId) absences.push({ entry: m.absentEntryId, reason: m.absentReason ?? 'NOTICE', round: m.round });
  }
  const final = ko.find((m) => m.round === maxRound);
  if (final?.winnerEntryId) reached.set(final.winnerEntryId, 'W');
  if (!ko.length) { // pure round robin: standings decide
    const tables = await groupStandings(db, categoryId);
    tables.forEach((g) => g.standings.forEach((s, i) => reached.set(s.id, i === 0 ? 'W' : i === 1 ? 'F' : 'G')));
  }

  const ids = [...reached.keys()];
  if (!ids.length) return { awarded: 0 };
  const entryPlayer = new Map((await db.select({ e: entries.id, p: entries.playerId }).from(entries).where(inArray(entries.id, ids))).map((r) => [r.e, r.p]));
  const yearAgo = new Date(t.endDate.getTime() - 365 * 86400000);
  for (const ab of absences) {
    // ITA youth procedures: no-show without notice, or notice without a medical certificate -> no points;
    // notice + medical certificate (max twice a year) or injury during play -> points for the stage reached;
    // leaving mid-tournament without injury -> no points.
    let pays = ab.reason === 'NOTICE_MEDICAL' || ab.reason === 'INJURY';
    if (ab.reason === 'NOTICE_MEDICAL') {
      const pid = entryPlayer.get(ab.entry);
      const prior = pid ? await db.select({ id: matches.id }).from(matches).innerJoin(entries, eq(entries.id, matches.absentEntryId))
        .where(and(eq(entries.playerId, pid), eq(matches.absentReason, 'NOTICE_MEDICAL'), gte(matches.updatedAt, yearAgo))) : [];
      if (prior.length > 2) pays = false;
    }
    if (!pays) zero.add(ab.entry);
    if (ab.reason === 'NO_NOTICE') flagged.push(ab.entry);
  }
  const rows = await db.select({ e: entries.id, p: players.id }).from(entries).innerJoin(players, eq(players.id, entries.playerId)).where(inArray(entries.id, ids));
  const date = t.endDate;
  let awarded = 0;
  for (const { e, p } of rows) {
    const key = reached.get(e) as string;
    const pts = zero.has(e) ? 0 : (table[key] ?? 0);
    await db.insert(pointsAwards).values({
      playerId: p, tournamentId: t.id, points: pts, multiplier, kind: 'singles', date, logligKey: `ita:${t.id}:${c.id}:${p}`,
    }).onConflictDoUpdate({ target: pointsAwards.logligKey, set: { points: pts, multiplier, date } });
    awarded++;
  }
  await audit(db, actor, 'points.award', 'category', categoryId, { awarded, noShowPlayers: flagged.map((e) => entryPlayer.get(e)) });
  return { awarded };
}

/** Round label for a KO match, for UI/notifications. */
export async function koRoundLabel(db: Db, categoryId: string, round: number): Promise<string> {
  const [r] = await db.select({ max: sql<number>`max(${matches.round})` }).from(matches).where(and(eq(matches.categoryId, categoryId), eq(matches.stage, 'KO')));
  return roundName(round, Number(r?.max ?? round));
}
