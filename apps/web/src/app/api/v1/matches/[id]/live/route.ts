import { db } from '@/db';
import { handle } from '@/lib/api';
import { recordLive } from '@/services/results';

/** Body: { sets: [{a, b, superTb?}] }. Pushes the current score while the match is still being played. */
export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(req, async (actor) => {
  const b = (await req.json()) as { sets?: { a: number; b: number; superTb?: boolean }[] };
  return recordLive(db, actor, (await ctx.params).id, b.sets ?? []);
});
