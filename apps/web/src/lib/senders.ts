import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Sender } from '@/services/notifications';

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

async function userOf(db: Db, id: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) throw new Error('user missing');
  return u;
}

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/**
 * Delivery drivers, configured from the environment. A channel without configuration is omitted,
 * so its notifications stay queued/fail visibly instead of being silently dropped.
 *  EMAIL: Resend (RESEND_API_KEY, EMAIL_FROM)   SMS: Twilio (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)   PUSH: Expo push service (no key needed)
 */
export function buildSenders(db: Db, env: Env = process.env, f: Fetch = fetch): Partial<Record<'EMAIL' | 'SMS' | 'PUSH', Sender>> {
  const out: Partial<Record<'EMAIL' | 'SMS' | 'PUSH', Sender>> = {};
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    out.EMAIL = async (n) => {
      const u = await userOf(db, n.userId);
      await ok(await f('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [u.email], subject: n.title, html: `<div dir="rtl" style="font-family:sans-serif"><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p></div>` }),
      }), 'email');
    };
  }
  if (env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM) {
    out.SMS = async (n) => {
      const u = await userOf(db, n.userId);
      if (!u.phone) throw new Error('no phone');
      await ok(await f(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
        method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: u.phone, From: env.TWILIO_FROM as string, Body: `${n.title}: ${n.body}` }),
      }), 'sms');
    };
  }
  out.PUSH = async (n) => {
    const toks = await db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.userId, n.userId));
    const expo = toks.filter((t) => t.token.startsWith('ExponentPushToken'));
    if (!expo.length) return; // in-app inbox only; the notification row itself is the inbox entry
    await ok(await f('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(expo.map((t) => ({ to: t.token, title: n.title, body: n.body, sound: 'default' }))),
    }), 'push');
  };
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
