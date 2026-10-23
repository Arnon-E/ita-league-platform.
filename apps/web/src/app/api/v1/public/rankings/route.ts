import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { AGE_GROUPS } from '@/services/public';
import { rankingPage } from '@/services/ranking-sql';

/** ?g=MALE|FEMALE &age=12|14|16|18 (optional) &club=<id> (optional) &offset=<n> &limit=<n> (optional paging; without them the whole table) &count=1 (just { total }) */
export const GET = (req: Request) => handlePublic(async () => {
  const q = new URL(req.url).searchParams;
  const age = Number(q.get('age'));
  const club = q.get('club');
  const limit = Number(q.get('limit'));
  const offset = Math.max(0, Number(q.get('offset')) || 0);
  const narrow = {
    gender: (q.get('g') === 'FEMALE' ? 'FEMALE' : 'MALE') as 'MALE' | 'FEMALE',
    ...((AGE_GROUPS as readonly number[]).includes(age) ? { age } : {}),
    ...(club ? { clubId: club } : {}),
  };
  if (q.get('count')) return { total: (await rankingPage(db, { ...narrow, limit: 1 })).total };
  // the rows of the requested page only; without a limit, the first 500
  return (await rankingPage(db, { ...narrow, limit: limit > 0 ? Math.min(200, limit) : 500, offset })).rows;
}, 60);
