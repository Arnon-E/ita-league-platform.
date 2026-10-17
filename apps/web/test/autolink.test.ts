import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { addPlayerProfile } from '@/services/accounts';
import { ClaimPending, listClaims, resolveClaim } from '@/services/claims';

beforeAll(resetDb);

const mkLoglig = async (first: string, last: string, year: number, gender: 'MALE' | 'FEMALE' = 'MALE') => {
  const [p] = await db.insert(schema.players).values({ firstName: first, lastName: last, birthDate: new Date(Date.UTC(year, 6, 1)), gender, logligId: `rk:${gender}:${year}:${first} ${last}` }).returning();
  return p!;
};

describe('adding a child who already exists from the federation data', () => {
  it('links the existing profile (with its history) instead of creating a duplicate, and lets the federation undo it', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'fed@t.il');
    const { actor: parent } = await mkUser('PLAYER', 'par@t.il');
    const { actor: other } = await mkUser('PLAYER', 'oth@t.il');
    const known = await mkLoglig('דניאל', 'כהן', 2014);
    await db.insert(schema.pointsAwards).values({ playerId: known.id, date: new Date(), points: 120, multiplier: 1, kind: 'singles' } as never).catch(() => {});

    // same name + birth year (exact date differs from the federation's estimate): linked at once
    const r = await addPlayerProfile(db, parent, { firstName: ' דניאל ', lastName: 'כהן', birthDate: new Date('2014-04-04'), gender: 'MALE', forChild: true });
    expect(r.linkedExisting).toBe(true);
    expect(r.id).toBe(known.id);
    expect((await db.select().from(schema.players)).length).toBe(1); // no duplicate
    expect((await db.select().from(schema.guardians).where(eq(schema.guardians.playerId, known.id))).length).toBe(1);
    const [fixed] = await db.select().from(schema.players).where(eq(schema.players.id, known.id));
    expect(fixed?.birthDate.toISOString().slice(0, 10)).toBe('2014-04-04'); // the estimate becomes the real date

    // it shows up for the federation to confirm or undo
    const pending = (await listClaims(db, fed)).filter((x) => x.c.userId === parent.id);
    expect(pending.length).toBe(1);

    // someone else adding the same child no longer gets it silently: a request goes to the federation
    await expect(addPlayerProfile(db, other, { firstName: 'דניאל', lastName: 'כהן', birthDate: new Date('2014-04-04'), gender: 'MALE', forChild: true })).rejects.toBeInstanceOf(ClaimPending);
    expect((await db.select().from(schema.players)).length).toBe(1);

    // the federation rejects the first link: it is undone
    await resolveClaim(db, fed, pending[0]!.c.id, 'REJECTED', { note: 'לא ההורה' });
    expect((await db.select().from(schema.guardians).where(eq(schema.guardians.playerId, known.id))).length).toBe(0);

    // a hand-made duplicate of the same child does not block linking to the federation's profile
    const { actor: p3 } = await mkUser('PLAYER', 'p3@t.il');
    const dupOwner = await db.insert(schema.players).values({ firstName: 'דניאל', lastName: 'כהן', birthDate: new Date('2014-04-04'), gender: 'MALE', accountId: null }).returning();
    await db.insert(schema.guardians).values({ playerId: dupOwner[0]!.id, userId: p3.id, relation: 'parent' });
    const again = await addPlayerProfile(db, parent, { firstName: 'דניאל', lastName: 'כהן', birthDate: new Date('2014-04-04'), gender: 'MALE', forChild: true });
    expect(again.linkedExisting).toBe(true);
    expect(again.id).toBe(known.id);

    // a different name or birth year still creates a new profile
    const fresh = await addPlayerProfile(db, parent, { firstName: 'אחר', lastName: 'לוי', birthDate: new Date('2014-04-04'), gender: 'MALE', forChild: true });
    expect(fresh.linkedExisting).toBe(false);
    const swappedYear = await addPlayerProfile(db, parent, { firstName: 'דניאל', lastName: 'כהן', birthDate: new Date('2013-04-04'), gender: 'MALE', forChild: true });
    expect(swappedYear.linkedExisting).toBe(false);
    expect((await db.select().from(schema.players).where(and(eq(schema.players.firstName, 'דניאל')))).length).toBe(3); // federation profile, the hand-made duplicate and the 2013 one
  });
});
