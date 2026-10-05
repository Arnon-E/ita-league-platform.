import Link from 'next/link';
import { ilike } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { searchPlayers } from '@/services/public';
import { STATUS } from '@/components/labels';

/** One box over players, clubs and tournaments. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const term = q.trim();
  const [players, clubs, ts] = term
    ? await Promise.all([
        searchPlayers(db, term, undefined, 20),
        db.select().from(schema.clubs).where(ilike(schema.clubs.name, `%${term}%`)).limit(20),
        db.select().from(schema.tournaments).where(ilike(schema.tournaments.name, `%${term}%`)).limit(20),
      ])
    : [[], [], []];
  const none = term && !players.length && !clubs.length && !ts.length;
  return (
    <Shell nav="search">
      <h1>חיפוש</h1>
      <form className="row" style={{ margin: '12px 0 4px' }}>
        <input name="q" defaultValue={q} placeholder="שחקנים, מועדונים, תחרויות" autoFocus style={{ flex: 1, minWidth: 200 }} />
        <button className="btn">חיפוש</button>
      </form>
      {none && <div className="card muted" style={{ marginTop: 14 }}>לא נמצאו תוצאות עבור &quot;{term}&quot;.</div>}
      {ts.length > 0 && <><h2>תחרויות</h2><div className="grid cols">{ts.map((t) => <Link key={t.id} href={`/tournaments/${t.id}`} className="card grid" style={{ gap: 6 }}><strong>{t.name}</strong><span><span className={`pill ${STATUS[t.status]?.[1] ?? ''}`}>{STATUS[t.status]?.[0] ?? t.status}</span></span></Link>)}</div></>}
      {players.length > 0 && <><h2>שחקנים</h2><div className="grid cols">{players.map(({ p, club }) => <Link key={p.id} href={`/players/${p.id}`} className="card grid" style={{ gap: 4 }}><strong>{p.firstName} {p.lastName}</strong><span className="muted">{club ?? ''}</span></Link>)}</div></>}
      {clubs.length > 0 && <><h2>מועדונים</h2><div className="grid cols">{clubs.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="card grid" style={{ gap: 4 }}><strong>{c.name}</strong><span className="muted">{c.city ?? ''}</span></Link>)}</div></>}
    </Shell>
  );
}
