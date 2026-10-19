import { db } from '@/db';
import { handle } from '@/lib/api';
import { findUserByEmail, linkPlayer, searchPlayersForLink, unlinkPlayer } from '@/services/claims';

/** ?q=<name>: players to link by hand, with the account and guardians each is linked to. */
export const GET = (req: Request) => handle(req, async (actor) => {
  const rows = await searchPlayersForLink(db, actor, new URL(req.url).searchParams.get('q') ?? '');
  return rows.map(({ p, acc, guardians }) => ({
    id: p.id, name: `${p.firstName} ${p.lastName}`, birth: p.birthDate,
    account: acc?.id ? { id: acc.id, email: acc.email } : null,
    guardians: guardians.map((g) => ({ userId: g.userId, email: g.email })),
  }));
});

/** Body: { playerId, email, mode: 'self' | 'guardian' } links; { playerId, unlink: true, userId? } removes the self link, or one guardian. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { playerId?: string; email?: string; mode?: string; unlink?: boolean; userId?: string };
  const playerId = String(b.playerId ?? '');
  if (b.unlink) { await unlinkPlayer(db, actor, playerId, b.userId || undefined); return { ok: true }; }
  const u = await findUserByEmail(db, actor, String(b.email ?? ''));
  if (!u) throw new Error('לא נמצא משתמש עם האימייל הזה');
  await linkPlayer(db, actor, playerId, u.id, b.mode === 'guardian');
  return { ok: true, user: u.name };
});
