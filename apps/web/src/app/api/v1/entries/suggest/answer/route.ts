import { db } from '@/db';
import { handle } from '@/lib/api';
import { answerSuggestion } from '@/services/children';
import { registerEntry } from '@/services/entries';

/** A parent answers a child's request. Body: { id, accept }. Accepting registers the child (the usual rules apply); declining just closes it. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { id?: string; accept?: boolean };
  await answerSuggestion(db, actor, String(b.id ?? ''), !!b.accept, (categoryId, playerId) => registerEntry(db, actor, categoryId, playerId));
  return { ok: true as const };
});
