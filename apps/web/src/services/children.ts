import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { hashPassword, validatePassword, type Actor } from '@/lib/auth';
import { audit } from './audit';
import { notifyUser } from './notifications';
import { ineligibleReason } from './eligibility';

const { users, players, guardians } = schema;

/**
 * A child's own login. The parent picks a user name and a password; there is no email. Internally the user name lives in the
 * email column as `name@kid.ita.invalid`, which is also how the system recognises a child account (view only, see assertNotChild).
 * The parent stays the guardian and does everything that has consequences: registering, paying, uploading documents.
 */
export const CHILD_DOMAIN = 'kid.ita.invalid';
export const childEmail = (username: string) => `${username.trim().toLowerCase()}@${CHILD_DOMAIN}`;
export const isChildEmail = (email: string) => email.toLowerCase().endsWith(`@${CHILD_DOMAIN}`);

export async function isChildActor(db: Db, actor: Actor): Promise<boolean> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, actor.id));
  return !!u && isChildEmail(u.email);
}

/** Children can look but not act: registering, paying and uploading documents stay with the parent. */
export async function assertNotChild(db: Db, actor: Actor): Promise<void> {
  if (await isChildActor(db, actor)) throw new Error('חשבון ילד הוא לצפייה בלבד. אפשר להציע להורה להירשם, והוא יבצע את ההרשמה');
}

/** Creates the child's login, or resets its password when it already exists. Only a guardian of the player may do this. */
export async function setChildLogin(db: Db, actor: Actor, playerId: string, username: string, password: string) {
  const [g] = await db.select().from(guardians).where(and(eq(guardians.playerId, playerId), eq(guardians.userId, actor.id)));
  if (!g) throw new Error('רק הורה של הילד/ה יכול ליצור לו כניסה');
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9._]{3,20}$/.test(name)) throw new Error('שם משתמש: 3 עד 20 תווים באנגלית, ספרות, נקודה או קו תחתון');
  const bad = validatePassword(password);
  if (bad) throw new Error(bad);
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) throw new Error('Player not found');
  const passwordHash = await hashPassword(password);
  const taken = async () => !!(await db.select({ id: users.id }).from(users).where(eq(users.email, childEmail(name))))[0];
  if (p.accountId) {
    const [cur] = await db.select().from(users).where(eq(users.id, p.accountId));
    if (!cur || !isChildEmail(cur.email)) throw new Error('לפרופיל הזה כבר יש חשבון');
    if (cur.email !== childEmail(name) && (await taken())) throw new Error('שם המשתמש תפוס');
    await db.update(users).set({ email: childEmail(name), passwordHash, failedLogins: 0, lockedUntil: null, sessionsValidAfter: new Date() }).where(eq(users.id, cur.id));
    await audit(db, actor, 'child.login.reset', 'player', playerId, {});
    return { username: name };
  }
  if (await taken()) throw new Error('שם המשתמש תפוס');
  const [u] = await db.insert(users).values({ email: childEmail(name), name: `${p.firstName} ${p.lastName}`, passwordHash, role: 'PLAYER' }).returning();
  await db.update(players).set({ accountId: (u as NonNullable<typeof u>).id }).where(eq(players.id, playerId));
  await audit(db, actor, 'child.login.create', 'player', playerId, {});
  return { username: name };
}

/** The user name of a child's login, for the parent to see. */
export async function childLoginName(db: Db, playerId: string): Promise<string | null> {
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p?.accountId) return null;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, p.accountId));
  return u && isChildEmail(u.email) ? u.email.split('@')[0]! : null;
}

/** A child asks to join a category: the guardians get a notification and decide. Nothing is registered or charged. */
export async function suggestEntry(db: Db, actor: Actor, categoryId: string) {
  const [p] = await db.select().from(players).where(eq(players.accountId, actor.id));
  if (!p) throw new Error('אין פרופיל שחקן בחשבון');
  const [row] = await db.select({ c: schema.categories, t: schema.tournaments }).from(schema.categories)
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId)).where(eq(schema.categories.id, categoryId));
  if (!row) throw new Error('הקטגוריה לא נמצאה');
  const why = ineligibleReason(p, row.c, row.t);
  if (why) throw new Error(why);
  const parents = await db.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.playerId, p.id));
  if (!parents.length) throw new Error('אין הורה מקושר');
  await db.insert(schema.entrySuggestions).values({ playerId: p.id, categoryId }).onConflictDoUpdate({ target: [schema.entrySuggestions.playerId, schema.entrySuggestions.categoryId], set: { status: 'PENDING' } });
  for (const g of parents) await notifyUser(db, g.userId, 'ENTRY_SUGGESTION', `${p.firstName} רוצה להירשם`, `${p.firstName} ${p.lastName} מבקש/ת להירשם ל${row.t.name} (${row.c.name}). אפשר לאשר דרך האזור שלי.`);
  return { ok: true as const };
}

/** What the children of this parent have asked for and the parent has not answered yet (cancelled and finished tournaments drop out). */
export async function pendingSuggestions(db: Db, actor: Actor) {
  const rows = await db.select({ s: schema.entrySuggestions, p: players, c: schema.categories, t: schema.tournaments }).from(schema.entrySuggestions)
    .innerJoin(guardians, eq(guardians.playerId, schema.entrySuggestions.playerId))
    .innerJoin(players, eq(players.id, schema.entrySuggestions.playerId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.entrySuggestions.categoryId))
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId))
    .where(and(eq(guardians.userId, actor.id), eq(schema.entrySuggestions.status, 'PENDING')));
  return rows.filter((r) => r.t.status === 'REGISTRATION_OPEN').map((r) => ({
    id: r.s.id, playerId: r.p.id, player: `${r.p.firstName} ${r.p.lastName}`, categoryId: r.c.id, category: r.c.name, tournamentId: r.t.id, tournament: r.t.name, at: r.s.createdAt,
  }));
}

/** The parent's answer: register the child (the usual rules apply) or dismiss the request. */
export async function answerSuggestion(db: Db, actor: Actor, suggestionId: string, accept: boolean, register: (categoryId: string, playerId: string) => Promise<unknown>) {
  const [s] = await db.select().from(schema.entrySuggestions).where(eq(schema.entrySuggestions.id, suggestionId));
  if (!s) throw new Error('ההצעה לא נמצאה');
  const [g] = await db.select().from(guardians).where(and(eq(guardians.playerId, s.playerId), eq(guardians.userId, actor.id)));
  if (!g) throw new Error('אין הרשאה להצעה הזו');
  if (accept) await register(s.categoryId, s.playerId);
  await db.update(schema.entrySuggestions).set({ status: accept ? 'DONE' : 'DISMISSED' }).where(eq(schema.entrySuggestions.id, suggestionId));
}
