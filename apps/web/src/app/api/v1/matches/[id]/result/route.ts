import { db } from '@/db';
import { handle } from '@/lib/api';
import { recordResult, type ResultInput } from '@/services/results';

/** Body: { status: 'COMPLETED'|'WALKOVER'|'RETIRED', sets?: [{a,b,superTb?}], absentEntryId? } */
export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(req, async (actor) => {
  const b = (await req.json()) as ResultInput;
  return recordResult(db, actor, (await ctx.params).id, b);
});
