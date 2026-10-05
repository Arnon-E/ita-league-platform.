import { eq, sum } from 'drizzle-orm';
import { computeRefund, manualRefund, type RefundPolicy } from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { loadRuleSet } from './rules';
import { scopeFor } from './tournaments';
import { refundPaymentIntent } from '@/lib/stripe';

const { payments, refunds, ledger, entries, categories, tournaments } = schema;

/** Records a successful charge (called by the payment provider webhook or by an admin for cash/transfer). */
export async function recordPayment(db: Db, entryId: string, amountAgorot: number, provider = 'manual', providerRef?: string) {
  if (amountAgorot < 0) throw new Error('Invalid amount');
  return db.transaction(async (tx) => {
    if (providerRef) {
      const [dup] = await tx.select().from(payments).where(eq(payments.providerRef, providerRef));
      if (dup) return dup; // webhook retries are idempotent
    }
    const [p] = await tx.insert(payments).values({ entryId, amountAgorot, status: 'PAID', provider, providerRef: providerRef ?? null }).returning();
    const row = p as NonNullable<typeof p>;
    await tx.insert(ledger).values({ kind: 'CHARGE', amountAgorot, paymentId: row.id });
    await tx.update(entries).set({ paymentStatus: 'PAID' }).where(eq(entries.id, entryId));
    return row;
  });
}

async function context(db: Db, entryId: string) {
  const [row] = await db.select({ e: entries, c: categories, t: tournaments }).from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId)).innerJoin(tournaments, eq(tournaments.id, categories.tournamentId))
    .where(eq(entries.id, entryId));
  if (!row) throw new Error('Entry not found');
  return row;
}

export async function refundedSoFar(db: Db, paymentId: string): Promise<number> {
  const [r] = await db.select({ s: sum(refunds.amountAgorot) }).from(refunds).where(eq(refunds.paymentId, paymentId));
  return Number(r?.s ?? 0);
}

/** What the policy says should be refunded if this entry withdraws now. */
export async function suggestedRefund(db: Db, entryId: string, now = new Date(), medical = false) {
  const { t, e } = await context(db, entryId);
  const rules = await loadRuleSet(db, t.ruleSetId);
  const policy = { ...rules.refund, ...((t.refundPolicy as Partial<RefundPolicy> | null) ?? {}) };
  const [draw] = await db.select().from(schema.draws).where(eq(schema.draws.categoryId, e.categoryId));
  const paidRows = await db.select().from(payments).where(eq(payments.entryId, entryId));
  const paid = paidRows.filter((p) => p.status !== 'FAILED').reduce((s, p) => s + p.amountAgorot, 0);
  const already = (await Promise.all(paidRows.map((p) => refundedSoFar(db, p.id)))).reduce((a, b) => a + b, 0);
  const d = computeRefund(paid / 100, now, {
    registrationCloses: t.registrationCloses ?? t.startDate, drawDone: draw?.createdAt, startsAt: t.startDate,
  }, policy, medical);
  return { ...d, amountAgorot: Math.max(0, Math.round(d.amount * 100) - already), paidAgorot: paid, alreadyAgorot: already };
}

/** Issues a refund against a payment. Manager provides the amount and a reason; capped at what was paid. */
export async function issueRefund(db: Db, actor: Actor, paymentId: string, amountAgorot: number, reason: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) throw new Error('Payment not found');
  const { t } = await context(db, p.entryId);
  assertCan(actor, 'payment.refund', await scopeFor(db, actor, t.id));
  return db.transaction(async (tx) => {
    const already = await refundedSoFar(tx as unknown as Db, paymentId);
    const cents = Math.round(manualRefund(p.amountAgorot / 100, already / 100, amountAgorot / 100, reason) * 100);
    // online payments are refunded at the provider first; if that fails nothing is recorded
    if (p.provider === 'stripe' && p.providerRef) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error('החזר מקוון דורש הגדרת Stripe');
      await refundPaymentIntent(key, p.providerRef, cents);
    }
    const [r] = await tx.insert(refunds).values({ paymentId, amountAgorot: cents, reason, byUserId: actor.id }).returning();
    const row = r as NonNullable<typeof r>;
    await tx.insert(ledger).values({ kind: 'REFUND', amountAgorot: -cents, paymentId, refundId: row.id });
    const total = already + cents;
    const status = total >= p.amountAgorot ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.update(payments).set({ status }).where(eq(payments.id, paymentId));
    await tx.update(entries).set({ paymentStatus: status }).where(eq(entries.id, p.entryId));
    await audit(tx as unknown as Db, actor, 'refund.issue', 'payment', paymentId, { amountAgorot: cents, reason });
    return row;
  });
}
