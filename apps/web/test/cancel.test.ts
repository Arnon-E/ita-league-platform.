import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { cancelMyEntry, registerEntry } from '@/services/entries';

beforeAll(resetDb);

describe('cancelling my own registration', () => {
  it('lets the parent cancel an unpaid entry, but not someone else, and not a paid one', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'f@t.il');
    const { actor: parent } = await mkUser('PLAYER', 'p@t.il');
    const { actor: other } = await mkUser('PLAYER', 'o@t.il');
    const kid = await mkPlayer('ילד', { birth: new Date('2014-04-04') });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id });
    const t = await createTournament(db, fed, { name: 'נוער', startDate: new Date('2026-12-10'), endDate: new Date('2026-12-12'), feeAgorot: 5000 });
    const c = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    const e = await registerEntry(db, parent, c.id, kid.id);

    await expect(cancelMyEntry(db, other, e.id)).rejects.toThrow('אין הרשאה');
    await cancelMyEntry(db, parent, e.id);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.id, e.id)))[0]?.status).toBe('WITHDRAWN');
    await expect(cancelMyEntry(db, parent, e.id)).rejects.toThrow('כבר בוטלה');

    // a paid registration goes through the federation (refund rules)
    const c2 = await addCategory(db, fed, t.id, { name: 'U16', gender: 'MALE' });
    const paid = await registerEntry(db, parent, c2.id, kid.id);
    await db.update(schema.entries).set({ paymentStatus: 'PAID' }).where(eq(schema.entries.id, paid.id));
    await expect(cancelMyEntry(db, parent, paid.id)).rejects.toThrow('שולמה');
  });
});
