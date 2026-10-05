import { db } from '@/db';
import { handle } from '@/lib/api';
import { startCheckout } from '@/services/checkout';

/** POST { entryId } -> { id, url } */
export const POST = (req: Request) => handle(req, async (actor) => {
  const { entryId } = (await req.json()) as { entryId?: string };
  if (!entryId) throw new Error('entryId required');
  return startCheckout(db, actor, entryId);
});
