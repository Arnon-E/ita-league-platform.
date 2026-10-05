import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { ownedPlayerIds, checkDocuments } from '@/services/entries';
import { inbox } from '@/services/notifications';

export const GET = (req: Request) => handle(req, async (actor) => {
  const ids = await ownedPlayerIds(db, actor);
  const ps = ids.length ? await db.select().from(schema.players).where(inArray(schema.players.id, ids)) : [];
  const ents = ids.length ? await db.select({ e: schema.entries, c: schema.categories, t: schema.tournaments }).from(schema.entries)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.entries.categoryId)).innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId))
    .where(inArray(schema.entries.playerId, ids)) : [];
  return {
    players: await Promise.all(ps.map(async (p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, documents: await checkDocuments(db, p.id, new Date()) }))),
    entries: ents.map(({ e, c, t }) => ({ id: e.id, tournament: t.name, category: c.name, status: e.status, payment: e.paymentStatus })),
    notifications: (await inbox(db, actor.id)).slice(-30).reverse().map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.createdAt })),
  };
});
