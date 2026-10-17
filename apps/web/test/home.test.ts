import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { myHome } from '@/services/home';

beforeAll(resetDb);

describe('personal home', () => {
  it('shows nothing without a profile, a player for a self profile, children for a parent, both for both', async () => {
    const { actor: nobody } = await mkUser('PLAYER', 'none@t.il');
    expect((await myHome(db, nobody)).role).toBe('NONE');

    const { actor: player } = await mkUser('PLAYER', 'p@t.il');
    await mkPlayer('עצמי', { accountId: player.id });
    const ph = await myHome(db, player);
    expect(ph.role).toBe('PLAYER');
    expect(ph.people[0]?.relation).toBe('SELF');

    const { actor: parent } = await mkUser('PLAYER', 'par@t.il');
    const kid = await mkPlayer('ילד', { birth: new Date('2014-03-03') });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id });
    const rh = await myHome(db, parent);
    expect(rh.role).toBe('PARENT');
    expect(rh.people.map((x) => x.relation)).toEqual(['CHILD']);
    expect(rh.people[0]?.todo.some((x) => x.startsWith('DOCS:'))).toBe(true); // documents missing -> needs attention

    const { actor: both } = await mkUser('PLAYER', 'both@t.il');
    await mkPlayer('אני', { accountId: both.id });
    const kid2 = await mkPlayer('ילדה', { gender: 'FEMALE', birth: new Date('2015-01-01') });
    await db.insert(schema.guardians).values({ playerId: kid2.id, userId: both.id });
    const bh = await myHome(db, both);
    expect(bh.role).toBe('BOTH');
    expect(bh.people.length).toBe(2);
  });

  it('gives admins, referees and club managers a work view', async () => {
    const { actor: admin } = await mkUser('FEDERATION_ADMIN', 'adm@t.il');
    const a = await myHome(db, admin);
    expect(a.work?.kind).toBe('ADMIN');
    expect(a.work?.admin?.pendingDocs).toBeGreaterThanOrEqual(0);

    const { actor: ref } = await mkUser('REFEREE', 'ref@t.il');
    expect((await myHome(db, ref)).work?.kind).toBe('REFEREE');

    const [club] = await db.insert(schema.clubs).values({ name: 'מועדון בדיקה' }).returning();
    const { actor: cm, user } = await mkUser('CLUB_MANAGER', 'club@t.il');
    await db.update(schema.users).set({ clubId: club!.id }).where(eq(schema.users.id, user.id));
    await db.update(schema.players).set({ clubId: club!.id }).where(eq(schema.players.firstName, 'עצמי'));
    const c = await myHome(db, cm);
    expect(c.work?.kind).toBe('CLUB');
    expect(c.work?.club?.players).toBe(1);
  });
});

describe('next match', () => {
  it('ignores matches left scheduled in competitions that are long over, and shows a real upcoming one', async () => {
    const { mkPlayer: mkP } = await import('./helpers');
    const { actor } = await mkUser('PLAYER', 'nextmatch@t.il');
    const me = await mkP('שחקן', { accountId: actor.id });
    const { ensureDefaultRuleSet } = await import('@/services/rules');
    const rule = await ensureDefaultRuleSet(db);
    const mkT = async (name: string, status: 'FINISHED' | 'IN_PROGRESS', start: string, end: string) => (await db.insert(schema.tournaments).values({ name, startDate: new Date(start), endDate: new Date(end), status, feeAgorot: 0, ruleSetId: rule.id }).returning())[0]!;
    const setup = async (t: Awaited<ReturnType<typeof mkT>>, startAt: Date | null) => {
      const c = (await db.insert(schema.categories).values({ tournamentId: t.id, name: 'בנים 12', gender: 'MALE', format: 'KNOCKOUT' }).returning())[0]!;
      const a = (await db.insert(schema.entries).values({ categoryId: c.id, playerId: me.id, status: 'CONFIRMED' }).returning())[0]!;
      const o = await mkP('יריב');
      const b = (await db.insert(schema.entries).values({ categoryId: c.id, playerId: o.id, status: 'CONFIRMED' }).returning())[0]!;
      await db.insert(schema.matches).values({ categoryId: c.id, stage: 'KO', round: 1, index: 0, aEntryId: a.id, bEntryId: b.id, status: 'SCHEDULED', sets: [], scheduledStart: startAt } as never);
    };
    await setup(await mkT('ישנה', 'FINISHED', '2026-02-26', '2026-02-28'), new Date('2026-02-28T08:00:00Z')); // stale
    const stale = await myHome(db, actor);
    expect(stale.people[0]?.nextMatch).toBeNull();
    const soon = new Date(Date.now() + 3 * 864e5);
    await setup(await mkT('קרובה', 'IN_PROGRESS', new Date(Date.now() - 864e5).toISOString().slice(0, 10), new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10)), soon);
    const fresh = await myHome(db, actor);
    expect(fresh.people[0]?.nextMatch?.tournament).toBe('קרובה');
  });
});
