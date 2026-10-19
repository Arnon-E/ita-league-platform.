import { asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { broadcast, type Audience } from '@/services/broadcast';

/** Targets for a broadcast: clubs and tournaments. */
export const GET = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'notification.send');
  const [clubs, ts] = await Promise.all([db.select().from(schema.clubs).orderBy(asc(schema.clubs.name)), db.select().from(schema.tournaments).orderBy(asc(schema.tournaments.name))]);
  return { clubs: clubs.map((c) => ({ id: c.id, name: c.name })), tournaments: ts.map((t) => ({ id: t.id, name: t.name })) };
});

/** Body: { audience: 'ALL' | 'CLUB' | 'TOURNAMENT', id?, title, body }. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { audience?: string; id?: string; title?: string; body?: string };
  const to: Audience = b.audience === 'CLUB' ? { kind: 'CLUB', id: String(b.id ?? '') } : b.audience === 'TOURNAMENT' ? { kind: 'TOURNAMENT', id: String(b.id ?? '') } : { kind: 'ALL' };
  if (to.kind !== 'ALL' && !to.id) throw new Error('בחרו יעד להודעה');
  return { sent: await broadcast(db, actor, to, String(b.title ?? '').trim(), String(b.body ?? '').trim()) };
});
