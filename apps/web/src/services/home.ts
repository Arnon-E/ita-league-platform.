import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { schema, type Db } from '@/db';
import type { Actor } from '@/lib/auth';
import { checkDocuments } from '@/services/entries';
import { childLoginName, isChildActor } from '@/services/children';
import { playerProfile } from '@/services/public';
import { rankingFor } from '@/services/rankings';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';

const { players, guardians, categories, tournaments, entries, matches, documents, claimRequests, tournamentStaff, users } = schema;

/**
 * The personal home: everything one signed-in person cares about, per player profile they own.
 * Profiles tied to the account itself are "SELF" (a player), profiles linked as guardian are "CHILD" (a parent),
 * and someone with both sees both. Nothing here is a new rule, it only gathers what the system already knows.
 */
export async function myHome(db: Db, actor: Actor) {
  const [people, work, isChild] = await Promise.all([myPeople(db, actor), workHome(db, actor), isChildActor(db, actor)]);
  return { ...people, work, isChild };
}

/**
 * What the person's job asks of them, for roles that run things rather than play: federation admins (queues to review),
 * tournament managers and referees (their tournaments and matches waiting for a result), club managers (their club's players).
 * Coaches are not a role in the system yet; a coach with a club sees the same as a club manager once such a role exists.
 */
async function workHome(db: Db, actor: Actor) {
  const now = new Date();
  const isAdmin = actor.role === 'SUPER_ADMIN' || actor.role === 'FEDERATION_ADMIN';
  const count = async (q: PromiseLike<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  if (isAdmin) {
    const [pendingDocs, pendingClaims, openRegistration, inProgress] = await Promise.all([
      count(db.select({ n: sql<number>`count(*)::int` }).from(documents).where(eq(documents.status, 'PENDING'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(claimRequests).where(eq(claimRequests.status, 'PENDING'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(tournaments).where(eq(tournaments.status, 'REGISTRATION_OPEN'))),
      count(db.select({ n: sql<number>`count(*)::int` }).from(tournaments).where(eq(tournaments.status, 'IN_PROGRESS'))),
    ]);
    return { kind: 'ADMIN' as const, admin: { pendingDocs, pendingClaims, openRegistration, inProgress }, tournaments: [], club: null };
  }
  if (actor.role === 'TOURNAMENT_MANAGER' || actor.role === 'REFEREE') {
    const mine = await db.select({ t: tournaments }).from(tournamentStaff).innerJoin(tournaments, eq(tournaments.id, tournamentStaff.tournamentId)).where(eq(tournamentStaff.userId, actor.id));
    const live = mine.filter(({ t }) => t.status !== 'FINISHED' && t.status !== 'CANCELLED' && t.endDate >= new Date(now.getTime() - 86400000));
    const out = await Promise.all(live.map(async ({ t }) => {
      const ms = await db.select({ m: matches }).from(matches).innerJoin(categories, eq(categories.id, matches.categoryId)).where(and(eq(categories.tournamentId, t.id), eq(matches.status, 'SCHEDULED')));
      const ready = ms.filter(({ m }) => m.aEntryId && m.bEntryId);
      return { id: t.id, name: t.name, status: t.status, start: t.startDate, end: t.endDate, waiting: ready.filter(({ m }) => !m.scheduledStart || m.scheduledStart < now).length, upcoming: ready.length };
    }));
    return { kind: actor.role, admin: null, tournaments: out.sort((a, b) => +a.start - +b.start), club: null };
  }
  if (actor.role === 'CLUB_MANAGER') {
    const [u] = await db.select().from(users).where(eq(users.id, actor.id));
    if (!u?.clubId) return null;
    const [club] = await db.select().from(schema.clubs).where(eq(schema.clubs.id, u.clubId));
    const ps = await db.select().from(players).where(eq(players.clubId, u.clubId));
    const tables = new Map<string, Awaited<ReturnType<typeof rankingFor>>>();
    const rules = await loadRuleSet(db, (await ensureDefaultRuleSet(db)).id);
    for (const g of new Set(ps.map((x) => x.gender))) tables.set(g, await rankingFor(db, g, now, rules));
    const ranked = ps.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, rank: tables.get(p.gender)?.find((r) => r.playerId === p.id)?.rank ?? null, points: tables.get(p.gender)?.find((r) => r.playerId === p.id)?.points ?? 0 }))
      .filter((x) => x.rank).sort((a, b) => a.rank! - b.rank!).slice(0, 5);
    const ids = ps.map((p) => p.id);
    const upcoming = ids.length ? await db.select({ n: sql<number>`count(distinct ${entries.id})::int` }).from(entries).innerJoin(categories, eq(categories.id, entries.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(and(inArray(entries.playerId, ids), gte(tournaments.endDate, now), lt(tournaments.startDate, new Date(now.getTime() + 90 * 86400000)))) : [];
    return { kind: 'CLUB' as const, admin: null, tournaments: [], club: { id: u.clubId, name: club?.name ?? '', players: ps.length, upcomingEntries: upcoming[0]?.n ?? 0, top: ranked } };
  }
  return null;
}

async function myPeople(db: Db, actor: Actor) {
  const own = await db.select().from(players).where(eq(players.accountId, actor.id));
  const links = await db.select({ p: players }).from(guardians).innerJoin(players, eq(players.id, guardians.playerId)).where(eq(guardians.userId, actor.id));
  const mine = [...own.map((p) => ({ p, relation: 'SELF' as const })), ...links.filter((l) => !own.some((o) => o.id === l.p.id)).map((l) => ({ p: l.p, relation: 'CHILD' as const }))];
  if (!mine.length) return { role: 'NONE' as const, people: [] };

  const now = new Date();
  const rules = await loadRuleSet(db, (await ensureDefaultRuleSet(db)).id);
  const tables = new Map<string, Awaited<ReturnType<typeof rankingFor>>>();
  for (const g of new Set(mine.map((x) => x.p.gender))) tables.set(g, await rankingFor(db, g, now, rules));

  const open = await db.select({ c: categories, t: tournaments }).from(categories)
    .innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(tournaments.status, 'REGISTRATION_OPEN'));
  const ownEntries = await db.select({ e: entries, c: categories, t: tournaments }).from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId))
    .where(inArray(entries.playerId, mine.map((x) => x.p.id)));

  const people = await Promise.all(mine.map(async ({ p, relation }) => {
    const d = await playerProfile(db, p.id);
    const row = tables.get(p.gender)?.find((r) => r.playerId === p.id);
    const by = p.birthDate.getUTCFullYear();
    const nameOf = (id: string | null) => (id ? d?.names.get(id) ?? null : null);
    const mineEntry = (id: string | null) => !!id && !!d?.entryIds.includes(id);
    const catOf = new Map((d?.ents ?? []).map((x) => [x.c.id, x]));
    const toRow = (m: NonNullable<typeof d>['matches'][number]) => {
      const iAmA = mineEntry(m.aEntryId);
      return {
        id: m.id, tournament: catOf.get(m.categoryId)?.t.name ?? '', category: catOf.get(m.categoryId)?.c.name ?? '', status: m.status,
        opponent: nameOf(iAmA ? m.bEntryId : m.aEntryId), start: m.scheduledStart, court: m.courtLabel,
        won: m.winnerEntryId ? mineEntry(m.winnerEntryId) : null,
        sets: ((m.sets ?? []) as { a: number; b: number }[]).map((s) => (iAmA ? { a: s.a, b: s.b } : { a: s.b, b: s.a })),
      };
    };
    const played = (d?.matches ?? []).filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.winnerEntryId)
      .sort((a, b) => (b.scheduledStart?.getTime() ?? 0) - (a.scheduledStart?.getTime() ?? 0));
    const upcoming = (d?.matches ?? []).filter((m) => m.status === 'SCHEDULED' && m.aEntryId && m.bEntryId)
      .sort((a, b) => (a.scheduledStart?.getTime() ?? Infinity) - (b.scheduledStart?.getTime() ?? Infinity));
    const docs = await checkDocuments(db, p.id, now);
    const entered = ownEntries.filter((x) => x.e.playerId === p.id && x.e.status !== 'WITHDRAWN' && x.e.status !== 'REJECTED');
    const nextTournament = entered.filter((x) => x.t.endDate >= now).sort((a, b) => a.t.startDate.getTime() - b.t.startDate.getTime())[0];
    const todo: string[] = [];
    if (!docs.ok) todo.push(`DOCS:${docs.missing.join(',')}`);
    for (const x of entered) if (x.e.paymentStatus === 'UNPAID' && x.t.feeAgorot > 0 && x.t.endDate > now) todo.push(`PAY:${x.t.name}`);
    return {
      id: p.id, name: `${p.firstName} ${p.lastName}`, relation, gender: p.gender, birthYear: by,
      childLogin: relation === 'CHILD' ? await childLoginName(db, p.id) : null,
      age: now.getUTCFullYear() - by, club: d?.club ?? null,
      rank: row?.rank ?? null, points: row?.points ?? 0, wins: d?.wins ?? 0, losses: d?.losses ?? 0,
      form: played.slice(0, 5).map((m) => mineEntry(m.winnerEntryId)),
      nextMatch: upcoming[0] ? toRow(upcoming[0]) : null,
      recent: played.slice(0, 3).map(toRow),
      nextTournament: nextTournament ? { id: nextTournament.t.id, name: nextTournament.t.name, start: nextTournament.t.startDate, category: nextTournament.c.name, status: nextTournament.e.status, payment: nextTournament.e.paymentStatus } : null,
      docsOk: docs.ok, missingDocs: docs.missing, todo,
      canRegister: open
        .filter(({ c }) => (c.gender === 'OPEN' || c.gender === p.gender) && !(c.minBirthYear && by < c.minBirthYear) && !(c.maxBirthYear && by > c.maxBirthYear) && !entered.some((x) => x.c.id === c.id))
        .map(({ c, t }) => ({ tournamentId: t.id, tournament: t.name, categoryId: c.id, category: c.name, closes: t.registrationCloses })),
    };
  }));
  const role = people.some((x) => x.relation === 'CHILD') ? (people.some((x) => x.relation === 'SELF') ? 'BOTH' : 'PARENT') : 'PLAYER';
  return { role: role as 'PLAYER' | 'PARENT' | 'BOTH', people };
}
