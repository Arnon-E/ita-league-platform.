import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal Stripe client over fetch (Checkout + refunds + webhook verification). Other providers implement the same three functions. */
type Fetch = typeof fetch;
const API = 'https://api.stripe.com/v1';

async function post(key: string, path: string, body: Record<string, string>, f: Fetch) {
  const res = await f(`${API}${path}`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

export async function createCheckoutSession(key: string, o: { entryId: string; amountAgorot: number; description: string; successUrl: string; cancelUrl: string; email?: string }, f: Fetch = fetch) {
  const j = await post(key, '/checkout/sessions', {
    mode: 'payment', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'ils',
    'line_items[0][price_data][unit_amount]': String(o.amountAgorot), 'line_items[0][price_data][product_data][name]': o.description,
    success_url: o.successUrl, cancel_url: o.cancelUrl, 'metadata[entryId]': o.entryId, 'payment_intent_data[metadata][entryId]': o.entryId,
    ...(o.email ? { customer_email: o.email } : {}),
  }, f);
  return { id: j.id as string, url: j.url as string };
}

export async function refundPaymentIntent(key: string, paymentIntent: string, amountAgorot: number, f: Fetch = fetch) {
  const j = await post(key, '/refunds', { payment_intent: paymentIntent, amount: String(amountAgorot) }, f);
  return j.id as string;
}

/** Verifies the `Stripe-Signature` header (t=timestamp,v1=hmac) with a replay window. */
export function verifyStripeSignature(raw: string, header: string, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const want = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return want.length === parts.v1.length && timingSafeEqual(Buffer.from(want), Buffer.from(parts.v1));
}
