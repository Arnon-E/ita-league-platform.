import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { approveDocs, mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { confirmEntry, registerEntry } from '@/services/entries';
import { recordPayment } from '@/services/payments';
import { runDraw } from '@/services/draws';
import { recordLive, recordResult } from '@/services/results';
import { liveFeed } from '@/services/public';
import { Forbidden } from '@/lib/permissions';

beforeAll(resetDb);

describe('live scoring', () => {
  it('pushes partial scores, shows them in the public feed, and clears on the final result', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
    const t = await createTournament(db, fed, { name: 'חי', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-02'), feeAgorot: 0, format: 'KNOCKOUT' });
    const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    for (let i = 0; i < 2; i++) {
      const p = await mkPlayer(`L${i}`);
      await approveDocs(p.id);
      const e = await registerEntry(db, fed, cat.id, p.id);
      await recordPayment(db, e.id, 0);
      await confirmEntry(db, fed, e.id);
    }
    await setStatus(db, fed, t.id, 'REGISTRATION_CLOSED');
    await runDraw(db, fed, cat.id, { code: 7 });
    const [m] = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id));

    await recordLive(db, fed, m!.id, [{ a: 6, b: 4 }, { a: 2, b: 1 }]);
    const feed = await liveFeed(db);
    expect(feed.live.map((r) => r.m.id)).toContain(m!.id);
    expect(feed.upcoming.map((r) => r.m.id)).not.toContain(m!.id);
    const [mid] = await db.select().from(schema.matches).where(eq(schema.matches.id, m!.id));
    expect(mid!.status).toBe('SCHEDULED');
    expect(mid!.winnerEntryId).toBeNull();

    await expect(recordLive(db, fed, m!.id, [{ a: 99, b: 0 }])).rejects.toThrow();

    const { actor: player } = await mkUser('PLAYER', `pl${Math.random()}@x.il`);
    await expect(recordLive(db, player, m!.id, [{ a: 1, b: 0 }])).rejects.toBeInstanceOf(Forbidden);

    await recordResult(db, fed, m!.id, { status: 'COMPLETED', sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }] });
    const [done] = await db.select().from(schema.matches).where(eq(schema.matches.id, m!.id));
    expect(done!.live).toBe(false);
    expect(done!.winnerEntryId).toBeTruthy();
    await expect(recordLive(db, fed, m!.id, [{ a: 1, b: 0 }])).rejects.toThrow();
  });
});
