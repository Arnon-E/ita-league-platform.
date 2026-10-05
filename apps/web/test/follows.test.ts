import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { approveDocs, mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus, setTournamentCourts } from '@/services/tournaments';
import { confirmEntry, registerEntry } from '@/services/entries';
import { recordPayment } from '@/services/payments';
import { runDraw } from '@/services/draws';
import { recordResult } from '@/services/results';
import { setMatchSlot } from '@/services/schedule';
import { isFollowing, toggleFollow } from '@/services/follows';

beforeAll(resetDb);

const notes = (userId: string) => db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));

describe('following', () => {
  it('toggles, notifies fans of reschedules and results, and never duplicates a player\'s own notice', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
    const t = await createTournament(db, fed, { name: 'מעקב', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-02'), feeAgorot: 0, format: 'KNOCKOUT' });
    await setTournamentCourts(db, fed, t.id, [{ label: '1' }]);
    const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    const accounts = [await mkUser('PLAYER', `a${Math.random()}@x.il`), await mkUser('PLAYER', `b${Math.random()}@x.il`)];
    const pids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const p = await mkPlayer(`F${i}`);
      await db.update(schema.players).set({ accountId: accounts[i]!.actor.id }).where(eq(schema.players.id, p.id));
      await approveDocs(p.id);
      const e = await registerEntry(db, fed, cat.id, p.id);
      await recordPayment(db, e.id, 0);
      await confirmEntry(db, fed, e.id);
      pids.push(p.id);
    }
    await setStatus(db, fed, t.id, 'REGISTRATION_CLOSED');
    await runDraw(db, fed, cat.id, { code: 3 });
    const [m] = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id));

    const fan = await mkUser('PLAYER', `fan${Math.random()}@x.il`);
    const tfan = await mkUser('PLAYER', `tfan${Math.random()}@x.il`);
    expect(await toggleFollow(db, fan.actor.id, 'PLAYER', pids[0]!)).toBe(true);
    expect(await isFollowing(db, fan.actor.id, 'PLAYER', pids[0]!)).toBe(true);
    await toggleFollow(db, tfan.actor.id, 'TOURNAMENT', t.id);
    await expect(toggleFollow(db, fan.actor.id, 'BOGUS', 'x')).rejects.toThrow();

    await setMatchSlot(db, fed, m!.id, { kind: 'EXACT', courtLabel: '1', start: new Date('2026-11-01T09:00:00') });
    await setMatchSlot(db, fed, m!.id, { kind: 'EXACT', courtLabel: '1', start: new Date('2026-11-01T11:00:00') });
    expect((await notes(fan.actor.id)).some((n) => n.kind === 'match.rescheduled')).toBe(true);
    expect((await notes(tfan.actor.id)).some((n) => n.kind === 'match.rescheduled')).toBe(true);

    await recordResult(db, fed, m!.id, { status: 'COMPLETED', sets: [{ a: 6, b: 1 }, { a: 6, b: 2 }] });
    expect((await notes(fan.actor.id)).some((n) => n.kind === 'match.result')).toBe(true);

    // the playing player is told directly, and not a second time as a fan of their own tournament
    const own = (await notes(accounts[0]!.actor.id)).filter((n) => n.kind === 'match.rescheduled' && n.channel === 'PUSH');
    expect(own.length).toBe(1);

    expect(await toggleFollow(db, fan.actor.id, 'PLAYER', pids[0]!)).toBe(false);
  });
});
