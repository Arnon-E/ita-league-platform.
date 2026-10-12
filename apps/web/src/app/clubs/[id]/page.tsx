import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { FollowButton } from '@/components/FollowButton';
import { clubDetail } from '@/services/public';

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await clubDetail(db, id);
  if (!d) notFound();
  const info = d.c.info as { address?: string; phone?: string; email?: string; description?: string; officials?: { name: string; job: string }[]; teams?: string[]; roster?: { name: string; age: number | null }[] } | null;
  return (
    <Shell nav="clubs">
      <Link href="/clubs" className="muted">← כל המועדונים</Link>
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>{d.c.name}</h1><FollowButton kind="CLUB" target={d.c.id} back={`/clubs/${d.c.id}`} /></div><p className="muted">{d.c.city ?? ''} · {d.ps.length} שחקנים</p>
      {info && (
        <div className="card grid" style={{ gap: 6 }}>
          {info.address && <span>📍 {info.address}</span>}
          {info.phone && <span>📞 <a href={`tel:${info.phone}`}>{info.phone}</a></span>}
          {info.email && <span>✉️ <a href={`mailto:${info.email}`}>{info.email}</a></span>}
          {info.description && <span className="muted">{info.description}</span>}
          {!!info.officials?.length && <span className="muted">{info.officials.map((o) => `${o.name}${o.job ? ` (${o.job})` : ''}`).join(' · ')}</span>}
          {!!info.teams?.length && <span className="muted">קבוצות: {info.teams.join(' · ')}</span>}
        </div>
      )}
      {!!info?.roster?.length && (
        <>
          <h2>שחקנים רשומים ({info.roster.length})</h2>
          <div className="card" style={{ overflow: 'auto' }}>
            <table><thead><tr><th>שחקן</th><th>גיל</th></tr></thead><tbody>
              {info.roster.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.age ?? ''}</td></tr>)}
            </tbody></table>
          </div>
        </>
      )}
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>שחקן</th></tr></thead><tbody>
          {d.ps.map((p) => <tr key={p.id}><td><Link href={`/players/${p.id}`}>{p.firstName} {p.lastName}</Link></td></tr>)}
        </tbody></table>
        {!d.ps.length && <p className="muted">אין שחקנים במועדון.</p>}
      </div>
    </Shell>
  );
}
