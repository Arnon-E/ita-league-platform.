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
  return (
    <Shell nav="clubs">
      <Link href="/clubs" className="muted">← כל המועדונים</Link>
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>{d.c.name}</h1><FollowButton kind="CLUB" target={d.c.id} back={`/clubs/${d.c.id}`} /></div><p className="muted">{d.c.city ?? ''} · {d.ps.length} שחקנים</p>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>שחקן</th></tr></thead><tbody>
          {d.ps.map((p) => <tr key={p.id}><td><Link href={`/players/${p.id}`}>{p.firstName} {p.lastName}</Link></td></tr>)}
        </tbody></table>
        {!d.ps.length && <p className="muted">אין שחקנים במועדון.</p>}
      </div>
    </Shell>
  );
}
