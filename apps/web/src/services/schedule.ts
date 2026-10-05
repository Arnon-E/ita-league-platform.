import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { scheduleMatches, type Court, type SchedMatch } from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { listCourtLabels, scopeFor } from './tournaments';
import { notifyPlayer } from './notifications';

const { matches, categories, entries, tournaments } = schema;
const MIN = 60000;

export interface AutoScheduleOptions {
  /** Start of play on the first day (a real timestamp, local time as intended by the manager). */
  firstDayStart: Date;
  days: number;
  /** Playing minutes each day, counted from the day's start (e.g. 12h = 720). */
  dailyMinutes: number;
  slotMin?: number;
  restMin?: number;
  categoryIds?: string[];
}

async function tournamentMatches(db: Db, tournamentId: string, categoryIds?: string[]) {
  const cats = await db.select({ id: categories.id }).from(categories).where(eq(categories.tournamentId, tournamentId));
  const ids = (categoryIds ?? cats.map((c) => c.id)).filter((id) => cats.some((c) => c.id === id));
  if (!ids.length) return [];
  return db.select().from(matches).where(inArray(matches.categoryId, ids));
}

async function playersOf(db: Db, entryIds: string[]): Promise<Map<string, string>> {
  if (!entryIds.length) return new Map();
  const rows = await db.select({ id: entries.id, p: entries.playerId }).from(entries).where(inArray(entries.id, entryIds));
  return new Map(rows.map((r) => [r.id, r.p]));
}

/**
 * Automatic fixtures. Resolved matches are left alone; EXACT manual times are honoured as hard assignments;
 * "not before" is a lower bound; later KO rounds wait for their feeder matches; players get a rest gap.
 * Each play day is a separate window, so matches never run past the end of the day.
 */
export async function autoSchedule(db: Db, actor: Actor, tournamentId: string, o: AutoScheduleOptions) {
  assertCan(actor, 'schedule.manage', await scopeFor(db, actor, tournamentId));
  const labels = await listCourtLabels(db, tournamentId);
  if (!labels.length) throw new Error('לא הוגדרו מגרשים לתחרות');
  const base = o.firstDayStart.getTime();
  const toMin = (d: Date) => Math.round((d.getTime() - base) / MIN);
  const toDate = (m: number) => new Date(base + m * MIN);

  const all = await tournamentMatches(db, tournamentId, o.categoryIds);
  const open = all.filter((m) => m.status === 'SCHEDULED');
  const openIds = new Set(open.map((m) => m.id));
  const pmap = await playersOf(db, open.flatMap((m) => [m.aEntryId, m.bEntryId]).filter((x): x is string => !!x));

  const courts: Court[] = [];
  for (let d = 0; d < o.days; d++) for (const l of labels) courts.push({ id: `${l}\u0000${d}`, from: d * 1440, to: d * 1440 + o.dailyMinutes });

  const sched: SchedMatch[] = open.map((m) => {
    const exactOk = m.scheduleKind === 'EXACT' && m.scheduledStart && m.courtLabel && labels.includes(m.courtLabel);
    const day = exactOk ? Math.floor(toMin(m.scheduledStart as Date) / 1440) : 0;
    const sm: SchedMatch = {
      id: m.id,
      players: [m.aEntryId, m.bEntryId].filter((x): x is string => !!x).map((e) => pmap.get(e) ?? e),
      durationMin: m.durationMin,
      after: (m.feederIds as string[]).filter((f) => openIds.has(f)),
    };
    if (m.notBefore) sm.notBefore = toMin(m.notBefore);
    if (exactOk) sm.exact = { start: toMin(m.scheduledStart as Date), courtId: `${m.courtLabel}\u0000${Math.max(0, day)}` };
    return sm;
  });

  const res = scheduleMatches(sched, courts, { windowStart: 0, windowEnd: (o.days - 1) * 1440 + o.dailyMinutes, slotMin: o.slotMin ?? 15, restMin: o.restMin ?? 30 });
  await db.transaction(async (tx) => {
    // auto (non-exact) assignments are recomputed
    const autoIds = open.filter((m) => m.scheduleKind !== 'EXACT').map((m) => m.id);
    if (autoIds.length) await tx.update(matches).set({ courtLabel: null, scheduledStart: null }).where(inArray(matches.id, autoIds));
    for (const a of res.assignments) {
      await tx.update(matches).set({ courtLabel: a.courtId.split('\u0000')[0] as string, scheduledStart: toDate(a.start) }).where(eq(matches.id, a.matchId));
    }
  });
  for (const a of res.assignments) {
    const m = open.find((x) => x.id === a.matchId);
    if (!m) continue;
    const changed = !m.scheduledStart || m.scheduledStart.getTime() !== toDate(a.start).getTime() || m.courtLabel !== (a.courtId.split('\u0000')[0] as string);
    if (!changed) continue;
    for (const e of [m.aEntryId, m.bEntryId]) {
      const pid = e ? pmap.get(e) : undefined;
      if (pid) await notifyPlayer(db, pid, 'match.scheduled', 'שובץ משחק', `מגרש ${a.courtId.split('\u0000')[0]} · ${toDate(a.start).toLocaleString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
    }
  }
  await audit(db, actor, 'schedule.auto', 'tournament', tournamentId, { assigned: res.assignments.length, unassigned: res.unassigned.length, conflicts: res.conflicts.length });
  return {
    assigned: res.assignments.length,
    unassigned: res.unassigned,
    conflicts: res.conflicts,
  };
}

export type SlotInput =
  | { kind: 'EXACT'; courtLabel: string; start: Date }
  | { kind: 'NOT_BEFORE'; notBefore: Date }
  | { kind: 'CLEAR' };

/** Manual assignment of one match: an exact time on a court (checked for court and player conflicts), or a "not before" time. */
export async function setMatchSlot(db: Db, actor: Actor, matchId: string, input: SlotInput) {
  const [row] = await db.select({ m: matches, t: tournaments }).from(matches)
    .innerJoin(categories, eq(categories.id, matches.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(matches.id, matchId));
  if (!row) throw new Error('Match not found');
  const { m, t } = row;
  assertCan(actor, 'schedule.manage', await scopeFor(db, actor, t.id));
  if (m.status !== 'SCHEDULED') throw new Error('המשחק כבר הסתיים');

  if (input.kind === 'CLEAR') {
    await db.update(matches).set({ scheduleKind: null, courtLabel: null, scheduledStart: null, notBefore: null }).where(eq(matches.id, matchId));
  } else if (input.kind === 'NOT_BEFORE') {
    await db.update(matches).set({ notBefore: input.notBefore, scheduleKind: 'NOT_BEFORE' }).where(eq(matches.id, matchId));
  } else {
    const labels = await listCourtLabels(db, t.id);
    if (!labels.includes(input.courtLabel)) throw new Error('המגרש אינו מוקצה לתחרות');
    const s = input.start.getTime();
    const e = s + m.durationMin * MIN;
    const others = (await tournamentMatches(db, t.id)).filter((x) => x.id !== m.id && x.scheduledStart && x.status === 'SCHEDULED');
    const overlap = (x: typeof others[number]) => {
      const xs = (x.scheduledStart as Date).getTime();
      return s < xs + x.durationMin * MIN && xs < e;
    };
    if (others.some((x) => x.courtLabel === input.courtLabel && overlap(x))) throw new Error('המגרש תפוס בשעה זו');
    const mine = [m.aEntryId, m.bEntryId].filter((x): x is string => !!x);
    if (mine.length) {
      const pm = await playersOf(db, [...mine, ...others.flatMap((x) => [x.aEntryId, x.bEntryId]).filter((x): x is string => !!x)]);
      const myPlayers = new Set(mine.map((x) => pm.get(x)));
      if (others.some((x) => overlap(x) && [x.aEntryId, x.bEntryId].some((p) => p && myPlayers.has(pm.get(p))))) throw new Error('שחקן משובץ למשחק אחר באותה שעה');
    }
    if (m.feederIds && (m.feederIds as string[]).length) {
      const fs = await db.select().from(matches).where(inArray(matches.id, m.feederIds as string[]));
      if (fs.some((f) => f.scheduledStart && f.scheduledStart.getTime() + f.durationMin * MIN > s)) throw new Error('המשחק מתחיל לפני שהמשחק הקודם בעץ מסתיים');
    }
    await db.update(matches).set({ scheduleKind: 'EXACT', courtLabel: input.courtLabel, scheduledStart: input.start }).where(eq(matches.id, matchId));
  }
  await audit(db, actor, 'schedule.set', 'match', matchId, input);
}

export async function listSchedule(db: Db, tournamentId: string) {
  const all = await tournamentMatches(db, tournamentId);
  return all.filter((m) => m.scheduledStart).sort((a, b) => (a.scheduledStart as Date).getTime() - (b.scheduledStart as Date).getTime());
}

export { isNotNull, ne, and };
