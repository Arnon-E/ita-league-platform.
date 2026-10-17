import { db } from '@/db';
import { handle } from '@/lib/api';
import { suggestEntry } from '@/services/children';

/** A child suggests a category to their parent. Body: { categoryId }. Nothing is registered. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { categoryId?: string };
  return suggestEntry(db, actor, String(b.categoryId ?? ''));
});
