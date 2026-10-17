import { db } from '@/db';
import { handle } from '@/lib/api';
import { setChildLogin } from '@/services/children';

/** A parent creates (or resets) a child's login. Body: { playerId, username, password }. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { playerId?: string; username?: string; password?: string };
  return setChildLogin(db, actor, String(b.playerId ?? ''), String(b.username ?? ''), String(b.password ?? ''));
});
