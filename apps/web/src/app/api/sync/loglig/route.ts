import { timingSafeEqual } from 'node:crypto';
import { db } from '@/db';
import { importRankings, validateRankingImport } from '@/services/loglig-rankings';

export const maxDuration = 60;

const authorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  if (!secret) return false;
  const a = Buffer.from(got), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Local sync scripts push public Loglig data here. Body: { gender: 'MALE'|'FEMALE', rows: [...] }. Bearer CRON_SECRET. */
export async function POST(req: Request) {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 });
  try {
    const input = validateRankingImport(await req.json());
    return Response.json(await importRankings(db, input));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
