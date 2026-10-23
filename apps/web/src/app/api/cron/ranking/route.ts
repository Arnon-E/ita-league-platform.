import { db } from '@/db';
import { refreshRankingSnapshot } from '@/services/ranking-sql';

/** Daily: rebuilds the stored ranking, because the 52-week window slides even on days when no result is entered. Requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json(await refreshRankingSnapshot(db));
}

export const GET = POST;
