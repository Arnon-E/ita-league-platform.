import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { AGE_GROUPS, rankingTable } from '@/services/public';

/** ?g=MALE|FEMALE &age=12|14|16|18 (optional) &club=<id> (optional) */
export const GET = (req: Request) => handlePublic(async () => {
  const q = new URL(req.url).searchParams;
  const age = Number(q.get('age'));
  const club = q.get('club');
  return rankingTable(db, {
    gender: q.get('g') === 'FEMALE' ? 'FEMALE' : 'MALE',
    ...((AGE_GROUPS as readonly number[]).includes(age) ? { age } : {}),
    ...(club ? { clubId: club } : {}),
  });
});
