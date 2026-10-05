import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan, type Scope } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { latestRuleSet } from './rules';

const { tournaments, tournamentCourts, tournamentStaff, categories, matches } = schema;

export async function scopeFor(db: Db, actor: Actor, tournamentId: string): Promise<Scope> {
  const rows = await db.select().from(tournamentStaff).where(and(eq(tournamentStaff.tournamentId, tournamentId), eq(tournamentStaff.userId, actor.id)));
  return { staffRoles: rows.map((r) => r.role) };
}

export interface CreateTournamentInput {
  name: string; startDate: Date; endDate: Date; venueId?: string;
  format?: 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'ROUND_ROBIN';
  feeAgorot?: number; registrationOpens?: Date; registrationCloses?: Date;
  setsToWin?: number; decider?: 'set' | 'superTb'; ruleSetId?: string; pointsTableKey?: string;
  level?: 'NATIONAL' | 'REGIONAL' | 'INTERNATIONAL' | 'CIRCUIT';
}

export async function createTournament(db: Db, actor: Actor, input: CreateTournamentInput) {
  assertCan(actor, 'tournament.create');
  if (input.endDate < input.startDate) throw new Error('תאריך הסיום קודם לתאריך ההתחלה');
  const ruleSetId = input.ruleSetId ?? (await latestRuleSet(db)).id;
  const [t] = await db.insert(tournaments).values({ ...input, ruleSetId }).returning();
  const row = t as NonNullable<typeof t>;
  // the creator manages the tournament they created
  if (actor.role === 'TOURNAMENT_MANAGER') await db.insert(tournamentStaff).values({ tournamentId: row.id, userId: actor.id, role: 'TOURNAMENT_MANAGER' });
  await audit(db, actor, 'tournament.create', 'tournament', row.id, { name: row.name });
  return row;
}

export async function addStaff(db: Db, actor: Actor, tournamentId: string, userId: string, role: 'TOURNAMENT_MANAGER' | 'REFEREE') {
  assertCan(actor, 'tournament.manage', await scopeFor(db, actor, tournamentId));
  await db.insert(tournamentStaff).values({ tournamentId, userId, role }).onConflictDoUpdate({
    target: [tournamentStaff.tournamentId, tournamentStaff.userId], set: { role },
  });
  await audit(db, actor, 'staff.add', 'tournament', tournamentId, { userId, role });
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['REGISTRATION_OPEN', 'DRAWN', 'CANCELLED'],
  DRAWN: ['IN_PROGRESS', 'REGISTRATION_CLOSED', 'CANCELLED'],
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [], CANCELLED: [],
};

export async function setStatus(db: Db, actor: Actor, tournamentId: string, to: keyof typeof TRANSITIONS) {
  assertCan(actor, 'tournament.manage', await scopeFor(db, actor, tournamentId));
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) throw new Error('Tournament not found');
  if (!(TRANSITIONS[t.status] ?? []).includes(to as string)) throw new Error(`לא ניתן לעבור מ-${t.status} ל-${String(to)}`);
  await db.update(tournaments).set({ status: to as never }).where(eq(tournaments.id, tournamentId));
  await audit(db, actor, 'tournament.status', 'tournament', tournamentId, { from: t.status, to });
}

export interface CourtInput { label: string; courtId?: string }

/**
 * Sets the courts allocated to this tournament. The manager controls the identifying label.
 * Matches that were on a removed court become unassigned and are returned.
 */
export async function setTournamentCourts(db: Db, actor: Actor, tournamentId: string, courts: CourtInput[]) {
  assertCan(actor, 'courts.manage', await scopeFor(db, actor, tournamentId));
  const labels = courts.map((c) => c.label.trim());
  if (labels.some((l) => !l)) throw new Error('כל מגרש חייב מזהה');
  if (new Set(labels).size !== labels.length) throw new Error('מזהי מגרשים חייבים להיות ייחודיים');
  if (labels.length === 0) throw new Error('נדרש לפחות מגרש אחד');
  const cats = await db.select({ id: categories.id }).from(categories).where(eq(categories.tournamentId, tournamentId));
  const catIds = cats.map((c) => c.id);
  const existing = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, tournamentId));
  const removed = existing.filter((e) => !labels.includes(e.label)).map((e) => e.label);
  let unassigned: string[] = [];
  await db.transaction(async (tx) => {
    if (removed.length && catIds.length) {
      const hit = await tx.select({ id: matches.id }).from(matches).where(and(inArray(matches.categoryId, catIds), inArray(matches.courtLabel, removed)));
      unassigned = hit.map((h) => h.id);
      if (unassigned.length) await tx.update(matches).set({ courtLabel: null, scheduleKind: null, scheduledStart: null }).where(inArray(matches.id, unassigned));
    }
    await tx.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, tournamentId));
    await tx.insert(tournamentCourts).values(courts.map((c, i) => ({ tournamentId, label: c.label.trim(), courtId: c.courtId ?? null, position: i })));
  });
  await audit(db, actor, 'courts.set', 'tournament', tournamentId, { labels, unassigned: unassigned.length });
  return { labels, unassigned };
}

export async function listCourtLabels(db: Db, tournamentId: string): Promise<string[]> {
  const rows = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, tournamentId)).orderBy(asc(tournamentCourts.position));
  return rows.map((r) => r.label);
}

export async function addCategory(db: Db, actor: Actor, tournamentId: string, input: {
  name: string; gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear?: number; maxBirthYear?: number; capacity?: number;
  format?: 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'ROUND_ROBIN'; groupConfig?: { groupSize: number; groupCount?: number; advancers: number };
}) {
  assertCan(actor, 'tournament.manage', await scopeFor(db, actor, tournamentId));
  const [c] = await db.insert(categories).values({ ...input, tournamentId }).returning();
  await audit(db, actor, 'category.add', 'tournament', tournamentId, { name: input.name });
  return c as NonNullable<typeof c>;
}
