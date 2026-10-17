import { db } from '@/db';
import { handle } from '@/lib/api';
import { cancelMyEntry } from '@/services/entries';

/** Cancel my registration (parent or player), while it is unpaid. */
export const DELETE = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(req, async (actor) => {
  await cancelMyEntry(db, actor, (await ctx.params).id);
  return { ok: true };
});
