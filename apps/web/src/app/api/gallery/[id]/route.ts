import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getObject } from '@/lib/storage';

/** Gallery photos are public by design; documents (IDs, medical certificates) never come through here. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [p] = await db.select().from(schema.galleryItems).where(eq(schema.galleryItems.id, (await ctx.params).id));
  if (!p) return new Response('Not found', { status: 404 });
  const buf = await getObject(p.storageKey);
  return new Response(new Uint8Array(buf), {
    headers: { 'content-type': p.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' },
  });
}
