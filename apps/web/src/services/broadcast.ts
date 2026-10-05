import { eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Actor } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import { audit } from './audit';
import { notifyUser, notifyPlayer } from './notifications';

export type Audience = { kind: 'ALL' } | { kind: 'CLUB'; id: string } | { kind: 'TOURNAMENT'; id: string };

/** Admin message to everyone, a club's players or a tournament's confirmed players (and their guardians). Returns recipient count. */
export async function broadcast(db: Db, actor: Actor, to: Audience, title: string, body: string): Promise<number> {
  assertCan(actor, 'notification.send');
  if (!title.trim() || !body.trim()) throw new Error('חובה למלא כותרת ותוכן');
  if (title.length > 120 || body.length > 2000) throw new Error('ההודעה ארוכה מדי');
  let count = 0;
  if (to.kind === 'ALL') {
    const us = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.active, true));
    for (const u of us) { await notifyUser(db, u.id, 'ANNOUNCEMENT', title, body); count++; }
  } else {
    let playerIds: string[];
    if (to.kind === 'CLUB') {
      playerIds = (await db.select({ id: schema.players.id }).from(schema.players).where(eq(schema.players.clubId, to.id))).map((x) => x.id);
    } else {
      const cats = (await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.tournamentId, to.id))).map((c) => c.id);
      playerIds = cats.length
        ? (await db.select({ id: schema.entries.playerId }).from(schema.entries).where(inArray(schema.entries.categoryId, cats))).map((x) => x.id)
        : [];
    }
    for (const id of new Set(playerIds)) { await notifyPlayer(db, id, 'ANNOUNCEMENT', title, body); count++; }
  }
  await audit(db, actor, 'broadcast.send', 'broadcast', undefined, { to, title, recipients: count });
  return count;
}
