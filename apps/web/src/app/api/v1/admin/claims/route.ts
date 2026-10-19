import { db } from '@/db';
import { handle } from '@/lib/api';
import { listClaims, resolveClaim } from '@/services/claims';

/** Pending requests to link an existing player to an account (needs the player.link permission). */
export const GET = (req: Request) => handle(req, async (actor) =>
  (await listClaims(db, actor)).map(({ c, u, p }) => ({
    id: c.id, user: u.name, email: u.email, first: c.firstName, last: c.lastName, birth: c.birthDate, forChild: c.forChild, reason: c.reason,
    candidate: p ? { id: p.id, name: `${p.firstName} ${p.lastName}`, birth: p.birthDate, linked: !!p.accountId } : null,
  })));

/** Body: { id, decision: 'APPROVED' | 'REJECTED', note? }. Approving links the request's user to the candidate player. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { id?: string; decision?: string; note?: string };
  if (b.decision !== 'APPROVED' && b.decision !== 'REJECTED') throw new Error('החלטה לא תקינה');
  await resolveClaim(db, actor, String(b.id ?? ''), b.decision, { note: b.note });
  return { ok: true };
});
