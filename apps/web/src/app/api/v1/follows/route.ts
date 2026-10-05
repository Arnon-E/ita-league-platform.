import { db } from '@/db';
import { handle } from '@/lib/api';
import { myFollows, toggleFollow } from '@/services/follows';

export const GET = (req: Request) => handle(req, async (actor) => (await myFollows(db, actor.id)).map((f) => ({ kind: f.kind, target: f.targetId })));

/** Body: { kind: 'PLAYER'|'CLUB'|'TOURNAMENT', target: id }. Toggles and returns the new state. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { kind?: string; target?: string };
  return { following: await toggleFollow(db, actor.id, String(b.kind ?? ''), String(b.target ?? '')) };
});
