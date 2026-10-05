import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { listTournaments } from '@/services/queries';
import { getActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { LEVEL, STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';

export default async function Home({ searchParams }: { searchParams: Promise<{ level?: string; season?: string }> }) {
  const t = await tr();
  const { level = '', season = '' } = await searchParams;
  const [ts, actor, counts] = await Promise.all([
    listTournaments(db),
    getActor(),
    db.execute(sql`select (select count(*) from players)::int as players, (select count(*) from clubs)::int as clubs,
      (select count(*) from matches where live and status = 'SCHEDULED')::int as live`),
  ]);
  const seasons = [...new Set(ts.map((x) => x.startDate.getFullYear()))].sort((a, b) => b - a);
  const shown = ts.filter((x) => (!level || x.level === level) && (!season || String(x.startDate.getFullYear()) === season));
  const href = (o: { level?: string; season?: string }) => `/?level=${o.level ?? level}&season=${o.season ?? season}`;
  const c = (counts as unknown as { players: number; clubs: number; live: number }[])[0]!;
  return (
    <Shell nav="home">
      <section className="hero">
        <h1>{t('איגוד הטניס בישראל')}</h1>
        <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
        <div className="row" style={{ marginTop: 18, gap: 28 }}>
          <div className="stat"><b>{ts.length}</b><span style={{ color: '#CFE0F7' }}>{t('תחרויות')}</span></div>
          <div className="stat"><b>{c.players}</b><span style={{ color: '#CFE0F7' }}>{t('שחקנים')}</span></div>
          <div className="stat"><b>{c.clubs}</b><span style={{ color: '#CFE0F7' }}>{t('מועדונים')}</span></div>
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <Link className="btn" style={{ background: 'var(--lime)', color: '#0B2545', boxShadow: 'none' }} href="/live">{c.live ? `${c.live} ${t('משחקים חיים עכשיו')}` : t('משחקים ותוצאות')}</Link>
          <Link className="btn ghost" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} href="/rankings">{t('לדירוג')}</Link>
        </div>
      </section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{t('תחרויות')}</h2>
        {actor && can(actor, 'tournament.create') && <Link className="btn" href="/tournaments/new">{t('תחרות חדשה')}</Link>}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Link href={href({ level: '' })} className={`pill ${!level ? 'lime' : ''}`}>{t('הכול')}</Link>
        {Object.entries(LEVEL).map(([k, v]) => <Link key={k} href={href({ level: k })} className={`pill ${level === k ? 'lime' : ''}`}>{t(v)}</Link>)}
        {seasons.length > 1 && <span className="muted" style={{ marginInlineStart: 'auto' }}>{t('עונה')}:</span>}
        {seasons.length > 1 && <Link href={href({ season: '' })} className={`pill ${!season ? 'lime' : ''}`}>{t('הכול')}</Link>}
        {seasons.length > 1 && seasons.map((y) => <Link key={y} href={href({ season: String(y) })} className={`pill ${season === String(y) ? 'lime' : ''}`}>{y}</Link>)}
      </div>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {shown.map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 8 }}>
            <span><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span></span>
            <strong style={{ fontSize: 18, lineHeight: 1.3 }}>{x.name}</strong>
            <span className="muted">{t(LEVEL[x.level] ?? '')}</span>
            <span className="muted">{x.startDate.toLocaleDateString('he-IL')} – {x.endDate.toLocaleDateString('he-IL')}</span>
          </Link>
        ))}
        {!shown.length && <div className="card muted">{t('אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.')}</div>}
      </div>
    </Shell>
  );
}
