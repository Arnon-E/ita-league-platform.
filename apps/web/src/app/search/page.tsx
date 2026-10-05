import Link from 'next/link';
import { ilike } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { searchPlayers } from '@/services/public';
import { STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';

/** One box over players, clubs and tournaments. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await tr();
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
      <h1>{t('חיפוש')}</h1>
      <form className="row" style={{ margin: '12px 0 4px' }}>
        <input name="q" defaultValue={q} placeholder={t('שחקנים, מועדונים, תחרויות')} autoFocus style={{ flex: 1, minWidth: 200 }} />
        <button className="btn">{t('חיפוש')}</button>
      </form>
      {none && <div className="card muted" style={{ marginTop: 14 }}>{t('לא נמצאו תוצאות עבור')} &quot;{term}&quot;.</div>}
      {ts.length > 0 && <><h2>{t('תחרויות')}</h2><div className="grid cols">{ts.map((x) => <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 6 }}><strong>{x.name}</strong><span><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span></span></Link>)}</div></>}
      {players.length > 0 && <><h2>{t('שחקנים')}</h2><div className="grid cols">{players.map(({ p, club }) => <Link key={p.id} href={`/players/${p.id}`} className="card grid" style={{ gap: 4 }}><strong>{p.firstName} {p.lastName}</strong><span className="muted">{club ?? ''}</span></Link>)}</div></>}
      {clubs.length > 0 && <><h2>{t('מועדונים')}</h2><div className="grid cols">{clubs.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="card grid" style={{ gap: 4 }}><strong>{c.name}</strong><span className="muted">{c.city ?? ''}</span></Link>)}</div></>}
    </Shell>
  );
}
