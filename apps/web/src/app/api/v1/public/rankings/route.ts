import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { AGE_GROUPS, rankingTable } from '@/services/public';

/** ?g=MALE|FEMALE &age=12|14|16|18 (optional) &club=<id> (optional) &offset=<n> &limit=<n> (optional paging; without them the whole table) &count=1 (just { total }) */
export const GET = (req: Request) => handlePublic(async () => {
  const q = new URL(req.url).searchParams;
  const age = Number(q.get('age'));
  const club = q.get('club');
  const rows = await rankingTable(db, {
    gender: q.get('g') === 'FEMALE' ? 'FEMALE' : 'MALE',
    ...((AGE_GROUPS as readonly number[]).includes(age) ? { age } : {}),
    ...(club ? { clubId: club } : {}),
  });
  if (q.get('count')) return { total: rows.length };
  const limit = Number(q.get('limit'));
  const offset = Math.max(0, Number(q.get('offset')) || 0);
  return limit > 0 ? rows.slice(offset, offset + Math.min(200, limit)) : rows;
});
