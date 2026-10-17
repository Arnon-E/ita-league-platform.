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
