import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { listTournaments } from '@/services/queries';
import { getActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { STATUS } from '@/components/labels';

export default async function Home() {
  const ts = await listTournaments(db);
  const actor = await getActor();
  return (
    <Shell nav="home">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>תחרויות</h1><p className="muted">{ts.length} תחרויות</p></div>
        {actor && can(actor, 'tournament.create') && <Link className="btn" href="/tournaments/new">תחרות חדשה</Link>}
      </div>
      <div className="grid cols" style={{ marginTop: 16 }}>
        {ts.map((t) => (
          <Link key={t.id} href={`/tournaments/${t.id}`} className="card grid" style={{ gap: 6 }}>
            <strong style={{ fontSize: 17 }}>{t.name}</strong>
            <span className="muted">{t.startDate.toLocaleDateString('he-IL')} – {t.endDate.toLocaleDateString('he-IL')}</span>
            <span><span className={`pill ${STATUS[t.status]?.[1] ?? ''}`}>{STATUS[t.status]?.[0] ?? t.status}</span></span>
          </Link>
        ))}
        {!ts.length && <div className="card muted">אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.</div>}
      </div>
    </Shell>
  );
}
