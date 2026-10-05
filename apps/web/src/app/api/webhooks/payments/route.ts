import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/db';
import { recordPayment } from '@/services/payments';

/**
 * Payment provider webhook. Body: { entryId, amountAgorot, providerRef, provider? }.
 * Header `x-signature` = hex HMAC-SHA256 of the raw body with PAYMENT_WEBHOOK_SECRET.
 * Idempotent on providerRef, so provider retries never double-charge the ledger.
 */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook not configured', { status: 503 });
  const raw = await req.text();
  const want = createHmac('sha256', secret).update(raw).digest('hex');
  const got = req.headers.get('x-signature') ?? '';
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return new Response('Bad signature', { status: 401 });
  let b: { entryId?: string; amountAgorot?: number; providerRef?: string; provider?: string };
  try { b = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!b.entryId || !Number.isInteger(b.amountAgorot) || !b.providerRef) return new Response('Missing fields', { status: 400 });
  try {
    const p = await recordPayment(db, b.entryId, b.amountAgorot as number, b.provider ?? 'provider', b.providerRef);
    return Response.json({ ok: true, paymentId: p.id });
  } catch {
    return new Response('Entry not found', { status: 404 });
  }
}
