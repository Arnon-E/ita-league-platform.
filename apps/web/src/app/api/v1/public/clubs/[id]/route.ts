import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { clubDetail } from '@/services/public';

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const d = await clubDetail(db, (await ctx.params).id);
  if (!d) throw new Error('not found');
  return { id: d.c.id, name: d.c.name, city: d.c.city, info: d.c.info ?? null, players: d.ps.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })) };
});
