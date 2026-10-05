import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import { signSession, type Actor, type Role } from '@/lib/auth';
import { audit } from './audit';

const { users, auditLog } = schema;

export async function listUsers(db: Db, actor: Actor) {
  assertCan(actor, 'user.manage');
  return db.select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active }).from(users).orderBy(users.email);
}

/** Only a super admin may grant SUPER_ADMIN or FEDERATION_ADMIN, and nobody changes their own role. */
export async function setUserRole(db: Db, actor: Actor, userId: string, role: Role) {
  assertCan(actor, 'user.manage');
  if (userId === actor.id) throw new Error('אי אפשר לשנות את התפקיד של עצמך');
  if ((role === 'SUPER_ADMIN' || role === 'FEDERATION_ADMIN') && actor.role !== 'SUPER_ADMIN') throw new Error('רק מנהל על יכול למנות מנהל איגוד/מנהל על');
  const [t] = await db.select().from(users).where(eq(users.id, userId));
  if (!t) throw new Error('User not found');
  if (t.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') throw new Error('אין הרשאה לשנות מנהל על');
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await audit(db, actor, 'user.role', 'user', userId, { from: t.role, to: role });
}

export async function setUserActive(db: Db, actor: Actor, userId: string, active: boolean) {
  assertCan(actor, 'user.manage');
  if (userId === actor.id) throw new Error('אי אפשר להשבית את עצמך');
  await db.update(users).set({ active }).where(eq(users.id, userId));
  await audit(db, actor, active ? 'user.activate' : 'user.deactivate', 'user', userId);
}

/** Super admin acts as another user for support. Short-lived, always audited, cannot be chained. */
export async function impersonate(db: Db, actor: Actor, userId: string) {
  assertCan(actor, 'impersonate');
  const [t] = await db.select().from(users).where(eq(users.id, userId));
  if (!t || !t.active) throw new Error('User not found');
  await audit(db, actor, 'impersonate.start', 'user', userId);
  return signSession({ id: t.id, role: t.role, impersonatedBy: actor.id }, '1h');
}

export async function recentAudit(db: Db, actor: Actor, limit = 200) {
  assertCan(actor, 'audit.read');
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
