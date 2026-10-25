import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { photoUrl } from '@/lib/photos';
import { searchPlayers } from '@/services/public';
import { playerRanks } from '@/services/ranking-sql';

/** ?q=<name> &club=<id> &g=MALE|FEMALE &age=10|12|14|16|18 &sec=YOUTH|ADULTS|MASTERS &offset=<n> &limit=<1..100>. */
export const GET = (req: Request) => handlePublic(async () => {
  const p = new URL(req.url).searchParams;
  const g = p.get('g');
  const age = Number(p.get('age'));
  const sec = p.get('sec');
  const limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 50));
  const offset = Math.max(0, Number(p.get('offset')) || 0);
  const rows = await searchPlayers(db, p.get('q') ?? '', p.get('club') || undefined, limit, {
    ...(g === 'MALE' || g === 'FEMALE' ? { gender: g } : {}),
    ...([10, 12, 14, 16, 18].includes(age) ? { age } : {}),
    ...(sec === 'YOUTH' || sec === 'ADULTS' || sec === 'MASTERS' ? { section: sec } : {}),
    offset,
    activeOnly: p.get('show') !== 'all',
  });
  const rk = await playerRanks(db, rows.map((x) => x.p.id));
  return rows.map(({ p: pl, club }) => ({ id: pl.id, name: `${pl.firstName} ${pl.lastName}`, club, gender: pl.gender, birthYear: pl.birthDate.getUTCFullYear(), age: Math.floor((Date.now() - pl.birthDate.getTime()) / (365.25 * 864e5)), photo: photoUrl(pl.photo), rank: rk.get(pl.id)?.rank ?? null }));
});
