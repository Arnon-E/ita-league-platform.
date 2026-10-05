import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { searchPlayers } from '@/services/public';

export const GET = (req: Request) => handlePublic(async () => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const rows = await searchPlayers(db, q, undefined, 50);
  return rows.map(({ p, club }) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, club }));
});
