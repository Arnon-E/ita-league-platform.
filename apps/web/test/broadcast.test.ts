import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { broadcast } from '@/services/broadcast';
import { Forbidden } from '@/lib/permissions';

beforeAll(resetDb);

describe('broadcast messages', () => {
  it('reaches a club\'s players, rejects non-admins and empty text, and is audited', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
    const [club] = await db.insert(schema.clubs).values({ name: `מועדון ${Math.random()}` }).returning();
    const acc = await mkUser('PLAYER', `p${Math.random()}@x.il`);
    const p = await mkPlayer('בוב');
    await db.update(schema.players).set({ clubId: club!.id, accountId: acc.actor.id }).where(eq(schema.players.id, p.id));

    const n = await broadcast(db, fed, { kind: 'CLUB', id: club!.id }, 'שינוי מועד', 'המשחק נדחה בשעה');
    expect(n).toBe(1);
    const got = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, acc.actor.id));
    expect(got.length).toBeGreaterThan(0);
    expect(got[0]!.kind).toBe('ANNOUNCEMENT');

    await expect(broadcast(db, acc.actor, { kind: 'ALL' }, 'x', 'y')).rejects.toBeInstanceOf(Forbidden);
    await expect(broadcast(db, fed, { kind: 'ALL' }, ' ', 'y')).rejects.toThrow();
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'broadcast.send'));
    expect(log.length).toBe(1);
  });
});
