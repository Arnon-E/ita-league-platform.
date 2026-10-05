import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { listPhotos } from '@/services/gallery';

/** Public: the photo ids and captions; images are served from /api/gallery/{id}. */
export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () =>
  (await listPhotos(db, (await ctx.params).id)).map((p) => ({ id: p.id, caption: p.caption })));
