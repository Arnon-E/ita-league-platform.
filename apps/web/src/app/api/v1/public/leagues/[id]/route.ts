import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handlePublic } from '@/lib/api';

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const [l] = await db.select().from(schema.externalLeagues).where(eq(schema.externalLeagues.id, (await ctx.params).id));
  if (!l) throw new Error('not found');
  return { id: l.id, name: l.name, updatedAt: l.updatedAt, ...(l.data as object) };
});
