import { db } from '@/db';
import { buildSenders } from '@/lib/senders';
import { dispatchQueued } from '@/services/notifications';

/** Called by a scheduler (e.g. every minute). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json(await dispatchQueued(db, buildSenders(db)));
}
