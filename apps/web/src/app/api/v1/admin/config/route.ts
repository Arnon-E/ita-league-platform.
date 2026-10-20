import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { buildSenders } from '@/lib/senders';

/**
 * Which delivery channels are configured on this deployment. Only yes/no per variable: the values are never returned.
 * Lets the admin check that email (Resend: RESEND_API_KEY + EMAIL_FROM) and SMS (Twilio) are set up without opening the host's dashboard.
 */
export const GET = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'notification.send');
  const e = process.env;
  const senders = buildSenders(db);
  return {
    email: { RESEND_API_KEY: !!e.RESEND_API_KEY, EMAIL_FROM: !!e.EMAIL_FROM, enabled: !!senders.EMAIL },
    sms: { TWILIO_SID: !!e.TWILIO_SID, TWILIO_TOKEN: !!e.TWILIO_TOKEN, TWILIO_FROM: !!e.TWILIO_FROM, enabled: !!senders.SMS },
    push: { enabled: !!senders.PUSH },
    cron: { CRON_SECRET: !!e.CRON_SECRET },
  };
});

/**
 * Body: { to }. Sends one test email through Resend and returns the provider's own answer (status and message), so a rejected
 * sender domain or key shows up as text. Only to the address of an existing user, so it cannot be used to mail strangers.
 */
export const POST = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'notification.send');
  const to = String(((await req.json().catch(() => ({}))) as { to?: string }).to ?? '').trim().toLowerCase();
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, to));
  if (!u) throw new Error('הכתובת אינה של משתמש רשום');
  const { RESEND_API_KEY: key, EMAIL_FROM: from } = process.env;
  if (!key || !from) throw new Error('שליחת אימייל לא מוגדרת');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'בדיקת שליחה: איגוד הטניס', html: '<div dir="rtl"><p>זו הודעת בדיקה. אם קיבלתם אותה, שליחת האימייל מוגדרת נכון.</p></div>' }),
  });
  return { ok: r.ok, status: r.status, from: from.replace(/^.*</, '').replace(/>.*$/, '').replace(/^[^@]*@/, '@'), answer: (await r.text()).slice(0, 300) };
});
