import { db } from '@/db';
import { verifyStripeSignature } from '@/lib/stripe';
import { recordPayment } from '@/services/payments';

/** Stripe webhook: checkout.session.completed marks the entry paid. Idempotent on the payment intent id. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature') ?? '', secret)) return new Response('Bad signature', { status: 400 });
  const ev = JSON.parse(raw) as { type: string; data: { object: { id: string; payment_intent?: string; amount_total?: number; payment_status?: string; metadata?: { entryId?: string } } } };
  if (ev.type !== 'checkout.session.completed') return Response.json({ ignored: true });
  const o = ev.data.object;
  if (o.payment_status !== 'paid' || !o.metadata?.entryId || !o.amount_total) return Response.json({ ignored: true });
  await recordPayment(db, o.metadata.entryId, o.amount_total, 'stripe', o.payment_intent ?? o.id);
  return Response.json({ ok: true });
}
