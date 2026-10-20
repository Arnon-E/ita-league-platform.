import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { buildSenders } from '@/lib/senders';
import { db } from '@/db';

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
