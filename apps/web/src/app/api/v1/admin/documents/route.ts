import { db } from '@/db';
import { handle } from '@/lib/api';
import { signedUrl } from '@/lib/storage';
import { pendingDocuments, reviewDocument } from '@/services/documents';

/** Pending documents for review (needs the document.review permission). */
export const GET = (req: Request) => handle(req, async (actor) =>
  (await pendingDocuments(db, actor)).map(({ d, p }) => ({ id: d.id, type: d.type, player: `${p.firstName} ${p.lastName}`, createdAt: d.createdAt, url: signedUrl(d.storageKey) })));

/** Body: { id, decision: 'APPROVED' | 'REJECTED', note? }. A rejection needs a note. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { id?: string; decision?: string; note?: string };
  if (b.decision !== 'APPROVED' && b.decision !== 'REJECTED') throw new Error('החלטה לא תקינה');
  await reviewDocument(db, actor, String(b.id ?? ''), b.decision, b.note);
  return { ok: true };
});
