import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { registerEntry } from '@/services/entries';

/** GET: categories open for registration. POST { categoryId, playerId }: register. */
export const GET = (req: Request) => handle(req, async () => {
  const rows = await db.select({ c: schema.categories, t: schema.tournaments }).from(schema.categories)
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId)).where(eq(schema.tournaments.status, 'REGISTRATION_OPEN'));
  return rows.map(({ c, t }) => ({ categoryId: c.id, category: c.name, gender: c.gender, minBirthYear: c.minBirthYear, maxBirthYear: c.maxBirthYear, tournament: t.name, feeAgorot: t.feeAgorot }));
});

export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json()) as { categoryId?: string; playerId?: string };
  if (!b.categoryId || !b.playerId) throw new Error('categoryId and playerId required');
  const e = await registerEntry(db, actor, b.categoryId, b.playerId);
  return { id: e.id, status: e.status };
});
