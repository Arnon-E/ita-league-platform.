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

import { parseRuleData, serialize, hydrate } from '@/services/rules';
import { ITA_DEFAULT_RULESET } from '@ita/rules-engine';

describe('rule set editing', () => {
  it('round-trips and rejects invalid seed tables', () => {
    const good = JSON.stringify(serialize(ITA_DEFAULT_RULESET));
    const parsed = parseRuleData(good);
    expect(hydrate('k', 2, parsed).points.W).toBe(100);
    const bad = JSON.parse(good); bad.seedTiers['8'] = [[1], [9]];
    expect(() => parseRuleData(JSON.stringify(bad))).toThrow('גדול');
    const dup = JSON.parse(good); dup.seedTiers['8'] = [[1], [1]];
    expect(() => parseRuleData(JSON.stringify(dup))).toThrow('פעמיים');
    const neg = JSON.parse(good); neg.refund.afterDraw = 2;
    expect(() => parseRuleData(JSON.stringify(neg))).toThrow();
  });
});

import { createHmac } from 'node:crypto';
import { createCheckoutSession, refundPaymentIntent, verifyStripeSignature } from '@/lib/stripe';

describe('stripe adapter', () => {
  it('verifies signatures with a replay window and builds correct API calls', async () => {
    const raw = '{"a":1}'; const t = 1_700_000_000;
    const v1 = createHmac('sha256', 'whsec_x').update(`${t}.${raw}`).digest('hex');
    expect(verifyStripeSignature(raw, `t=${t},v1=${v1}`, 'whsec_x', t * 1000)).toBe(true);
    expect(verifyStripeSignature(raw, `t=${t},v1=${v1}`, 'whsec_x', (t + 301) * 1000)).toBe(false);
    expect(verifyStripeSignature('{"a":2}', `t=${t},v1=${v1}`, 'whsec_x', t * 1000)).toBe(false);
    const seen: { url: string; body: string }[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, body: String(init.body) }); return new Response(JSON.stringify({ id: 'cs_1', url: 'https://pay/x' }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await createCheckoutSession('sk', { entryId: 'e1', amountAgorot: 15000, description: 'T', successUrl: 's', cancelUrl: 'c' }, f);
    expect(r.url).toBe('https://pay/x');
    expect(seen[0]!.body).toContain('unit_amount%5D=15000');
    expect(seen[0]!.body).toContain('ils');
    await refundPaymentIntent('sk', 'pi_1', 500, f);
    expect(seen[1]!.url).toContain('/refunds');
    const bad = (async () => new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 402 })) as unknown as typeof fetch;
    await expect(refundPaymentIntent('sk', 'pi_1', 500, bad)).rejects.toThrow('nope');
  });
});
