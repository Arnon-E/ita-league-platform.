import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { canonicalClub, mergeClubs } from '@/services/clubs';

beforeAll(resetDb);

describe('canonicalClub', () => {
  it('keeps the first of several clubs and maps known spellings', () => {
    expect(canonicalClub('מכבי נתניה, TD קיסריה')).toBe('מכבי נתניה');
    expect(canonicalClub('מכבי צפון תל אביב , איגוד הטניס בישראל')).toBe('מכבי צפון תל אביב');
    expect(canonicalClub('מכבי ראשון לציון גלי הדר')).toBe('מכבי גלי הדר ראשון לציון');
    expect(canonicalClub('מרה"ט קרית אונו/גבעת שמואל')).toBe('מרה"ט קרית אונו/גבעת שמואל');
    expect(canonicalClub('')).toBe('');
  });
});

describe('mergeClubs', () => {
  it('moves players, managers and followers into the canonical club and removes the leftovers', async () => {
    const [main] = await db.insert(schema.clubs).values({ name: 'מכבי גלי הדר ראשון לציון' }).returning();
    const [alias] = await db.insert(schema.clubs).values({ name: 'מכבי ראשון לציון גלי הדר' }).returning();
    const [combo] = await db.insert(schema.clubs).values({ name: 'מכבי גלי הדר ראשון לציון, מכבי ראשון לציון גלי הדר' }).returning();
    const [orphanCombo] = await db.insert(schema.clubs).values({ name: 'מועדון חדש, מועדון אחר' }).returning();
    const p1 = await mkPlayer('א'), p2 = await mkPlayer('ב'), p3 = await mkPlayer('ג');
    await db.update(schema.players).set({ clubId: main!.id }).where(eq(schema.players.id, p1.id));
    await db.update(schema.players).set({ clubId: alias!.id }).where(eq(schema.players.id, p2.id));
    await db.update(schema.players).set({ clubId: combo!.id }).where(eq(schema.players.id, p3.id));
    const { user: mgr } = await mkUser('CLUB_MANAGER', 'm@c.il');
    await db.update(schema.users).set({ clubId: alias!.id }).where(eq(schema.users.id, mgr.id));
    const { actor: fan } = await mkUser('PLAYER', 'f@c.il');
    await db.insert(schema.follows).values([{ userId: fan.id, kind: 'CLUB', targetId: main!.id }, { userId: fan.id, kind: 'CLUB', targetId: alias!.id }]);

    const dry = await mergeClubs(db, { dryRun: true });
    expect(dry.plan.map((x) => x.to).sort()).toEqual(['מועדון חדש', 'מכבי גלי הדר ראשון לציון', 'מכבי גלי הדר ראשון לציון']);
    expect((await db.select().from(schema.clubs)).length).toBe(4); // a dry run changes nothing

    const r = await mergeClubs(db);
    expect(r.merged).toBe(3);
    const names = (await db.select().from(schema.clubs)).map((c) => c.name).sort();
    expect(names).toEqual(['מועדון חדש', 'מכבי גלי הדר ראשון לציון']); // the combined club with no canonical club is renamed, not lost
    const at = async (id: string) => (await db.select().from(schema.players).where(eq(schema.players.id, id)))[0]?.clubId;
    expect([await at(p1.id), await at(p2.id), await at(p3.id)]).toEqual([main!.id, main!.id, main!.id]);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, mgr.id)))[0]?.clubId).toBe(main!.id);
    expect((await db.select().from(schema.follows).where(eq(schema.follows.userId, fan.id))).map((f) => f.targetId)).toEqual([main!.id]); // no duplicate follow
    expect((await mergeClubs(db)).merged).toBe(0); // idempotent
    void orphanCombo;
  });
});
