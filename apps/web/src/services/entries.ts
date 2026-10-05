import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { scopeFor } from './tournaments';

const { entries, categories, tournaments, players, documents, groupMembers, guardians } = schema;

export async function ownedPlayerIds(db: Db, actor: Actor): Promise<string[]> {
  const own = await db.select({ id: players.id }).from(players).where(eq(players.accountId, actor.id));
  const kids = await db.select({ id: guardians.playerId }).from(guardians).where(eq(guardians.userId, actor.id));
  return [...own, ...kids].map((x) => x.id);
}

const ageAt = (birth: Date, on: Date) => {
  let a = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) a--;
  return a;
};

export interface DocCheck { ok: boolean; missing: string[] }

/** Documents required for this player to compete: ID photo, valid medical certificate, parental consent for minors. */
export async function checkDocuments(db: Db, playerId: string, onDate: Date): Promise<DocCheck> {
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) throw new Error('Player not found');
  const docs = await db.select().from(documents).where(and(eq(documents.playerId, playerId), eq(documents.status, 'APPROVED')));
  const valid = (type: string) => docs.some((d) => d.type === type && (!d.expiresAt || d.expiresAt >= onDate));
  const missing: string[] = [];
  if (!valid('ID_PHOTO')) missing.push('ID_PHOTO');
  if (!valid('MEDICAL_CERTIFICATE')) missing.push('MEDICAL_CERTIFICATE');
  if (ageAt(p.birthDate, onDate) < 18 && !valid('PARENT_CONSENT')) missing.push('PARENT_CONSENT');
  return { ok: missing.length === 0, missing };
}

export async function registerEntry(db: Db, actor: Actor, categoryId: string, playerId: string, now = new Date()) {
  const [row] = await db.select({ c: categories, t: tournaments }).from(categories).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(categories.id, categoryId));
  if (!row) throw new Error('Category not found');
  const { c, t } = row;
  const scope = await scopeFor(db, actor, t.id);
  const mine = await ownedPlayerIds(db, actor);
  const isStaff = (scope.staffRoles ?? []).includes('TOURNAMENT_MANAGER') || actor.role === 'FEDERATION_ADMIN' || actor.role === 'SUPER_ADMIN';
  if (!isStaff) assertCan(actor, 'entry.registerSelf', { ...scope, ownedPlayerIds: mine, playerId });
  if (t.status !== 'REGISTRATION_OPEN' && !isStaff) throw new Error('ההרשמה לתחרות סגורה');
  if (!isStaff && ((t.registrationOpens && now < t.registrationOpens) || (t.registrationCloses && now > t.registrationCloses))) throw new Error('ההרשמה לתחרות סגורה');
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) throw new Error('Player not found');
  if (c.gender !== 'OPEN' && c.gender !== p.gender) throw new Error('הקטגוריה אינה מתאימה למין השחקן');
  const by = p.birthDate.getUTCFullYear();
  if ((c.minBirthYear && by < c.minBirthYear) || (c.maxBirthYear && by > c.maxBirthYear)) throw new Error('שנת הלידה אינה מתאימה לקטגוריה');
  const [e] = await db.insert(entries).values({ categoryId, playerId }).onConflictDoNothing().returning();
  if (!e) throw new Error('השחקן כבר רשום לקטגוריה');
  await audit(db, actor, 'entry.register', 'entry', e.id, { categoryId, playerId });
  return e;
}

/** Confirms an entry once documents are approved and the fee is paid. Over capacity => waitlist. */
export async function confirmEntry(db: Db, actor: Actor | null, entryId: string, opts: { override?: boolean } = {}) {
  const [row] = await db.select({ e: entries, c: categories, t: tournaments }).from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(entries.id, entryId));
  if (!row) throw new Error('Entry not found');
  const { e, c, t } = row;
  if (opts.override) assertCan(actor as Actor, 'entry.manage', await scopeFor(db, actor as Actor, t.id));
  if (!opts.override) {
    const docs = await checkDocuments(db, e.playerId, t.endDate);
    if (!docs.ok) throw new Error(`חסרים מסמכים: ${docs.missing.join(', ')}`);
    if (t.feeAgorot > 0 && e.paymentStatus !== 'PAID') throw new Error('התשלום טרם התקבל');
  }
  const confirmed = await db.select().from(entries).where(and(eq(entries.categoryId, c.id), eq(entries.status, 'CONFIRMED')));
  const status = c.capacity && confirmed.length >= c.capacity ? 'WAITLIST' : 'CONFIRMED';
  await db.update(entries).set({ status }).where(eq(entries.id, entryId));
  await audit(db, actor, 'entry.confirm', 'entry', entryId, { status, override: !!opts.override });
  return status;
}

/** Withdraws an entry, marks the player as withdrawn in his group and promotes the next waitlisted player. */
export async function withdrawEntry(db: Db, actor: Actor, entryId: string) {
  const [row] = await db.select({ e: entries, c: categories }).from(entries).innerJoin(categories, eq(categories.id, entries.categoryId)).where(eq(entries.id, entryId));
  if (!row) throw new Error('Entry not found');
  const { e, c } = row;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, c.tournamentId));
  const scope = await scopeFor(db, actor, (t as NonNullable<typeof t>).id);
  const mine = await ownedPlayerIds(db, actor);
  const isStaff = actor.role === 'FEDERATION_ADMIN' || actor.role === 'SUPER_ADMIN' || (scope.staffRoles ?? []).includes('TOURNAMENT_MANAGER');
  if (!isStaff) assertCan(actor, 'entry.registerSelf', { ...scope, ownedPlayerIds: mine, playerId: e.playerId });
  await db.update(entries).set({ status: 'WITHDRAWN' }).where(eq(entries.id, entryId));
  await db.update(groupMembers).set({ withdrawn: true }).where(eq(groupMembers.entryId, entryId));
  let promoted: string | null = null;
  if (e.status === 'CONFIRMED') {
    const [next] = await db.select().from(entries).where(and(eq(entries.categoryId, c.id), eq(entries.status, 'WAITLIST'))).orderBy(asc(entries.createdAt)).limit(1);
    if (next) { await db.update(entries).set({ status: 'CONFIRMED' }).where(eq(entries.id, next.id)); promoted = next.id; }
  }
  await audit(db, actor, 'entry.withdraw', 'entry', entryId, { promoted });
  return { promoted };
}

export async function confirmedEntries(db: Db, categoryId: string) {
  return db.select({ e: entries, p: players }).from(entries).innerJoin(players, eq(players.id, entries.playerId))
    .where(and(eq(entries.categoryId, categoryId), inArray(entries.status, ['CONFIRMED'])));
}
