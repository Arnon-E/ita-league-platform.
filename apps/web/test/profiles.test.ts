import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { login } from '@/lib/auth';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { setChildLogin } from '@/services/children';
import { removeProfile, updateProfile } from '@/services/profiles';

beforeAll(resetDb);

const born = new Date('2014-04-04');

describe('editing and removing a child', () => {
  it('lets the parent fix details, with limits, and delete or detach the profile', async () => {
    const { actor: parent } = await mkUser('PLAYER', 'p1@t.il');
    const { actor: other } = await mkUser('PLAYER', 'p2@t.il');
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'f@t.il');
    const kid = await mkPlayer('דנה', { gender: 'FEMALE', birth: born });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id, relation: 'parent' });

    // only the parent
    await expect(updateProfile(db, other, kid.id, { firstName: 'x', lastName: 'y', birthDate: born, gender: 'FEMALE' })).rejects.toThrow('אין הרשאה');
    await expect(removeProfile(db, other, kid.id)).rejects.toThrow('אין הרשאה');

    // a typo in the name is fixed; the child's login follows the name
    await setChildLogin(db, parent, kid.id, 'dana.k', 'Passw0rd!!x');
    await updateProfile(db, parent, kid.id, { firstName: 'דנה', lastName: 'כהן', birthDate: born, gender: 'FEMALE' });
    const [row] = await db.select().from(schema.players).where(eq(schema.players.id, kid.id));
    expect(row?.lastName).toBe('כהן');
    await expect(updateProfile(db, parent, kid.id, { firstName: '', lastName: 'x', birthDate: born, gender: 'FEMALE' })).rejects.toThrow();

    // birth date / gender are locked while there is an active registration
    const t = await createTournament(db, fed, { name: 'פתוחה', startDate: new Date('2026-12-01'), endDate: new Date('2026-12-02'), feeAgorot: 0 });
    const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'FEMALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    await registerEntry(db, parent, cat.id, kid.id);
    await expect(updateProfile(db, parent, kid.id, { firstName: 'דנה', lastName: 'כהן', birthDate: new Date('2013-01-01'), gender: 'FEMALE' })).rejects.toThrow('הרשמות פעילות');
    await updateProfile(db, parent, kid.id, { firstName: 'דניאלה', lastName: 'כהן', birthDate: born, gender: 'FEMALE' }); // name only: fine

    // with history: detached, registrations withdrawn, login closed, record stays
    const res = await removeProfile(db, parent, kid.id);
    expect(res.deleted).toBe(false);
    const [kept] = await db.select().from(schema.players).where(eq(schema.players.id, kid.id));
    expect(kept?.accountId).toBeNull();
    expect((await db.select().from(schema.guardians).where(eq(schema.guardians.playerId, kid.id))).length).toBe(0);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.playerId, kid.id)))[0]?.status).toBe('WITHDRAWN');
    expect((await login(db, 'dana.k', 'Passw0rd!!x')).ok).toBe(false);

    // without history: deleted outright, and the user name is free again
    const kid2 = await mkPlayer('יוסי', { birth: born });
    await db.insert(schema.guardians).values({ playerId: kid2.id, userId: parent.id, relation: 'parent' });
    await setChildLogin(db, parent, kid2.id, 'dana.k', 'Passw0rd!!x');
    expect((await removeProfile(db, parent, kid2.id)).deleted).toBe(true);
    expect((await db.select().from(schema.players).where(eq(schema.players.id, kid2.id))).length).toBe(0);
    const kid3 = await mkPlayer('שחר', { birth: born });
    await db.insert(schema.guardians).values({ playerId: kid3.id, userId: parent.id, relation: 'parent' });
    await setChildLogin(db, parent, kid3.id, 'dana.k', 'Passw0rd!!x'); // name reusable
  });
});
