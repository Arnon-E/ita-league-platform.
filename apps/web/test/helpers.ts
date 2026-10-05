import { sql as dsql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashPassword, type Actor } from '@/lib/auth';

export async function resetDb() {
  await db.execute(dsql`TRUNCATE ${dsql.raw(Object.values(schema).filter((t: any) => t && typeof t === 'object' && Symbol.for('drizzle:Name') in t).map((t: any) => `"${t[Symbol.for('drizzle:Name')]}"`).join(','))} RESTART IDENTITY CASCADE`);
}

export async function mkUser(role: Actor['role'], email: string, name = email) {
  const [u] = await db.insert(schema.users).values({ email, name, role, passwordHash: await hashPassword('Passw0rd!!') }).returning();
  const row = u as NonNullable<typeof u>;
  return { actor: { id: row.id, role } as Actor, user: row };
}

let n = 0;
export async function mkPlayer(first: string, opts: { gender?: 'MALE' | 'FEMALE'; birth?: Date; accountId?: string } = {}) {
  n++;
  const [p] = await db.insert(schema.players).values({
    firstName: first, lastName: `T${n}`, birthDate: opts.birth ?? new Date('2008-05-05'), gender: opts.gender ?? 'MALE', accountId: opts.accountId ?? null,
  }).returning();
  return p as NonNullable<typeof p>;
}

export async function approveDocs(playerId: string) {
  for (const type of ['ID_PHOTO', 'MEDICAL_CERTIFICATE', 'PARENT_CONSENT'] as const) {
    await db.insert(schema.documents).values({ playerId, type, status: 'APPROVED', storageKey: `k/${playerId}/${type}`, mime: 'image/jpeg' });
  }
}
