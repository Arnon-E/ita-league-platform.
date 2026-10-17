import { db } from '@/db';
import { handle } from '@/lib/api';
import { flushNotifications } from '@/lib/senders';
import { suggestEntry } from '@/services/children';

/** A child suggests a category to their parent. Body: { categoryId }. Nothing is registered. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { categoryId?: string };
  const r = await suggestEntry(db, actor, String(b.categoryId ?? ''));
  await flushNotifications(db); // the parent should hear about it now, not at the next scheduled run
  return r;
});
