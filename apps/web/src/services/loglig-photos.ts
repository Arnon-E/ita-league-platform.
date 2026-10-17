import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

/**
 * Profile photos come from Loglig's public player endpoint, one request per player, so they are filled in gradually by a local script:
 * it asks which players still have no photo (those on an account or in an upcoming competition first, then by ranking points),
 * reads each one's Image from Loglig and sends the file names back. A player Loglig has no photo for gets '' so it is not asked again.
 */
export async function photosNeeded(db: Db, limit: number) {
  const n = Math.max(1, Math.min(2000, Math.floor(limit) || 300));
  const rows = await db.execute(sql`
    select p.id, coalesce(p.loglig_user_id, substring(p.loglig_id from 4)) as user_id
    from players p
    where p.photo is null and (p.loglig_user_id is not null or p.loglig_id like 'll:%')
    order by
      (p.account_id is not null or exists (select 1 from guardians g where g.player_id = p.id)) desc,
      exists (select 1 from entries e join categories c on c.id = e.category_id join tournaments t on t.id = c.tournament_id
              where e.player_id = p.id and t.status not in ('FINISHED', 'CANCELLED')) desc,
      coalesce((select sum(a.points) from points_awards a where a.player_id = p.id), 0) desc
    limit ${n}`);
  return (rows as unknown as { id: string; user_id: string }[]).map((r) => ({ playerId: r.id, userId: Number(r.user_id) })).filter((r) => r.userId > 0);
}

export interface PhotoIn { userId: number; image: string | null }

export function validatePhotos(x: unknown): PhotoIn[] {
  const items = (x as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error('invalid photos');
  return items.slice(0, 2000).map((i) => ({ userId: Number((i as PhotoIn)?.userId) || 0, image: /^[\w.\-]{1,160}$/.test(String((i as PhotoIn)?.image ?? '')) ? String((i as PhotoIn).image) : null })).filter((i) => i.userId > 0);
}

export async function importPhotos(db: Db, items: PhotoIn[]) {
  if (!items.length) return { updated: 0 };
  const batch = JSON.stringify(items.map((i) => ({ uid: String(i.userId), image: i.image ?? '' })));
  // one player per Loglig user (a ranked player and one created from a roster can both point at the same user): prefer the one that
  // already carries the user id, then the ranking-keyed one, so the unique user id is never claimed twice
  await db.execute(sql`
    with m as (
      select distinct on (t.uid) p.id, t.uid, t.image
      from jsonb_to_recordset(${batch}::jsonb) as t(uid text, image text)
      join players p on p.loglig_user_id = t.uid or p.loglig_id = 'll:' || t.uid or p.loglig_id = 'lu:' || t.uid
      order by t.uid, (p.loglig_user_id is not null) desc, (p.loglig_id like 'll:%') desc, p.id
    )
    update players p set photo = m.image,
      loglig_user_id = coalesce(p.loglig_user_id, case when not exists (select 1 from players q where q.loglig_user_id = m.uid) then m.uid end)
    from m where p.id = m.id`);
  return { updated: items.length };
}
