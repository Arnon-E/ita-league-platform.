import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { listTournaments } from '@/services/queries';
import { getActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';

export default async function Home() {
  const t = await tr();
  const [ts, actor, counts] = await Promise.all([
    listTournaments(db),
    getActor(),
    db.execute(sql`select (select count(*) from players)::int as players, (select count(*) from clubs)::int as clubs,
      (select count(*) from matches where live and status = 'SCHEDULED')::int as live`),
  ]);
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
      <div className="grid cols" style={{ marginTop: 14 }}>
        {ts.map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 8 }}>
            <span><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span></span>
            <strong style={{ fontSize: 18, lineHeight: 1.3 }}>{x.name}</strong>
            <span className="muted">{x.startDate.toLocaleDateString('he-IL')} – {x.endDate.toLocaleDateString('he-IL')}</span>
          </Link>
        ))}
        {!ts.length && <div className="card muted">{t('אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.')}</div>}
      </div>
    </Shell>
  );
}
