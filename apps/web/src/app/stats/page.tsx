import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { sql } from 'drizzle-orm';
import { tr } from '@/lib/i18n';

type Row = { id: string; name: string; club: string | null; played: number; wins: number };

export default async function Stats() {
  const tt = await tr();
  // Per player: matches with a winner, and how many they won. A player's entries are per category.
  const players = (await db.execute(sql`
    select p.id, p.first_name || ' ' || p.last_name as name, c.name as club,
      count(m.id)::int as played,
      count(m.id) filter (where m.winner_entry_id = e.id)::int as wins
    from players p
    join entries e on e.player_id = p.id and e.status = 'CONFIRMED'
    join matches m on (m.a_entry_id = e.id or m.b_entry_id = e.id) and m.winner_entry_id is not null
    left join clubs c on c.id = p.club_id
    group by p.id, c.name
    order by wins desc, played asc limit 20`)) as unknown as Row[];
  const clubs = (await db.execute(sql`
    select c.id, c.name, count(distinct p.id)::int as players
    from clubs c join players p on p.club_id = c.id group by c.id order by players desc limit 10`)) as unknown as { id: string; name: string; players: number }[];
  const totals = (await db.execute(sql`
    select (select count(*) from tournaments)::int as tournaments, (select count(*) from players)::int as players,
      (select count(*) from matches where winner_entry_id is not null)::int as matches`)) as unknown as { tournaments: number; players: number; matches: number }[];
  const t = totals[0]!;
  return (
    <Shell nav="stats">
      <h1>{tt('סטטיסטיקות')}</h1>
      <div className="grid cols" style={{ marginTop: 12 }}>
        <div className="card"><div className="muted">{tt('תחרויות')}</div><strong style={{ fontSize: 28 }}>{t.tournaments}</strong></div>
        <div className="card"><div className="muted">{tt('שחקנים')}</div><strong style={{ fontSize: 28 }}>{t.players}</strong></div>
        <div className="card"><div className="muted">{tt('משחקים שהסתיימו')}</div><strong style={{ fontSize: 28 }}>{t.matches}</strong></div>
      </div>
      <h2>{tt('מובילים בניצחונות')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>#</th><th>{tt('שחקן')}</th><th>{tt('מועדון')}</th><th>{tt('משחקים')}</th><th>{tt('ניצחונות')}</th><th>{tt('אחוז')}</th></tr></thead><tbody>
          {players.map((p, i) => <tr key={p.id}><td>{i + 1}</td><td><Link href={`/players/${p.id}`}>{p.name}</Link></td><td>{p.club ?? '—'}</td><td>{p.played}</td><td><strong>{p.wins}</strong></td><td>{Math.round((100 * p.wins) / p.played)}%</td></tr>)}
        </tbody></table>
        {!players.length && <p className="muted">{tt('אין עדיין משחקים שהסתיימו.')}</p>}
      </div>
      <h2>{tt('מועדונים גדולים')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{tt('מועדון')}</th><th>{tt('שחקנים')}</th></tr></thead><tbody>
          {clubs.map((c) => <tr key={c.id}><td><Link href={`/clubs/${c.id}`}>{c.name}</Link></td><td>{c.players}</td></tr>)}
        </tbody></table>
      </div>
    </Shell>
  );
}
