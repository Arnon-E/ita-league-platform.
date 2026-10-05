import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { liveFeed } from '@/services/public';
import { fmtTime, MSTATUS, fmtScore } from '@/components/labels';

export default async function Live() {
  const { live, upcoming, results, names } = await liveFeed(db);
  const nm = (id: string | null) => (id ? names.get(id) ?? '?' : '—');
  return (
    <Shell nav="live">
      <h1>משחקים</h1>
      <meta httpEquiv="refresh" content="30" />
      {live.length > 0 && <>
        <h2>משחקים חיים</h2>
        <div className="grid cols">
          {live.map(({ m, c, t }) => <Link key={m.id} href={`/matches/${m.id}`} className="card grid" style={{ gap: 4 }}><span className="pill lime" style={{ width: 'fit-content' }}>חי{m.courtLabel ? ` · מגרש ${m.courtLabel}` : ''}</span><strong>{nm(m.aEntryId)} – {nm(m.bEntryId)}</strong><strong style={{ fontSize: 22 }}>{fmtScore(m.sets as { a: number; b: number }[])}</strong><span className="muted">{t.name} · {c.name}</span></Link>)}
        </div>
      </>}
      <h2>משחקים קרובים</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>שעה</th><th>מגרש</th><th>משחק</th><th>תחרות</th></tr></thead><tbody>
          {upcoming.map(({ m, c, t }) => <tr key={m.id}><td>{fmtTime(m.scheduledStart)}</td><td>{m.courtLabel ?? '—'}</td><td><Link href={`/matches/${m.id}`}>{nm(m.aEntryId)} – {nm(m.bEntryId)}</Link></td><td><Link href={`/tournaments/${t.id}`}>{t.name} · {c.name}</Link></td></tr>)}
        </tbody></table>
        {!upcoming.length && <p className="muted">אין משחקים מתוכננים.</p>}
      </div>
      <h2>תוצאות אחרונות</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>משחק</th><th>תוצאה</th><th>תחרות</th></tr></thead><tbody>
          {results.map(({ m, c, t }) => <tr key={m.id}>
            <td><Link href={`/matches/${m.id}`}>{nm(m.aEntryId)} – {nm(m.bEntryId)}</Link></td>
            <td><span className="pill ok">{MSTATUS[m.status]} {fmtScore(m.sets as { a: number; b: number }[])}</span></td>
            <td><Link href={`/tournaments/${t.id}`}>{t.name} · {c.name}</Link></td>
          </tr>)}
        </tbody></table>
        {!results.length && <p className="muted">אין עדיין תוצאות.</p>}
      </div>
    </Shell>
  );
}
