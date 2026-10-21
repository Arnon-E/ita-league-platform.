import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { handlePublic } from '@/lib/api';

export const GET = () => handlePublic(async () => {
  const top = (await db.execute(sql`
    select p.id, p.first_name || ' ' || p.last_name as name, c.name as club,
      count(m.id)::int as played, count(m.id) filter (where m.winner_entry_id = e.id)::int as wins
    from players p
    join entries e on e.player_id = p.id and e.status = 'CONFIRMED'
    join matches m on (m.a_entry_id = e.id or m.b_entry_id = e.id) and m.winner_entry_id is not null
    left join clubs c on c.id = p.club_id
    group by p.id, c.name order by wins desc, played asc limit 20`)) as unknown as { id: string; name: string; club: string | null; played: number; wins: number }[];
  const clubs = (await db.execute(sql`
    select c.id, c.name, count(distinct p.id)::int as players from clubs c join players p on p.club_id = c.id group by c.id order by players desc limit 10`)) as unknown as { id: string; name: string; players: number }[];
  const [totals] = (await db.execute(sql`
    select (select count(*) from tournaments)::int as tournaments, (select count(*) from players)::int as players,
      (select count(*) from matches where winner_entry_id is not null)::int as matches`)) as unknown as { tournaments: number; players: number; matches: number }[];
  return { totals, top, clubs };
}, 60);
