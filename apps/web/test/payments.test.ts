import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { issueRefund, recordPayment, refundedSoFar, suggestedRefund } from '@/services/payments';
import { Forbidden } from '@/lib/permissions';

beforeAll(resetDb);

describe('refunds', () => {
  it('suggests by stage, caps manual refunds, requires a reason and permission, keeps the ledger balanced', async () => {
    const fed = (await mkUser('FEDERATION_ADMIN', 'r@x.il')).actor;
    const t = await createTournament(db, fed, { name: 'R', startDate: new Date(Date.now() + 10 * 86400000), endDate: new Date(Date.now() + 12 * 86400000), feeAgorot: 20000, registrationCloses: new Date(Date.now() + 5 * 86400000) });
    const cat = await addCategory(db, fed, t.id, { name: 'c', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    const p = await mkPlayer('R');
    const e = await registerEntry(db, fed, cat.id, p.id);
    const pay = await recordPayment(db, e.id, 20000, 'manual');
    const s = await suggestedRefund(db, e.id);
    expect(s.paidAgorot).toBe(20000);
    expect(s.amountAgorot).toBe(20000); // before registration closes: full refund by default policy
    await expect(issueRefund(db, fed, pay.id, 5000, ' ')).rejects.toThrow();
    const stranger = (await mkUser('PLAYER', 's@x.il')).actor;
    await expect(issueRefund(db, stranger, pay.id, 5000, 'x')).rejects.toBeInstanceOf(Forbidden);
    await issueRefund(db, fed, pay.id, 5000, 'פציעה');
    expect(await refundedSoFar(db, pay.id)).toBe(5000);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.id, e.id)))[0]!.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect((await suggestedRefund(db, e.id)).amountAgorot).toBe(15000);
    await expect(issueRefund(db, fed, pay.id, 15001, 'יותר מדי')).rejects.toThrow();
    await issueRefund(db, fed, pay.id, 15000, 'השלמה');
    expect((await db.select().from(schema.entries).where(eq(schema.entries.id, e.id)))[0]!.paymentStatus).toBe('REFUNDED');
    const led = await db.select().from(schema.ledger);
    expect(led.reduce((a, x) => a + x.amountAgorot, 0)).toBe(0);
  });
});
