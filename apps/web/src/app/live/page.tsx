import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { liveFeed } from '@/services/public';
import { fmtTime, MSTATUS } from '@/components/labels';

export default async function Live() {
  const { upcoming, results, names } = await liveFeed(db);
  const nm = (id: string | null) => (id ? names.get(id) ?? '?' : '—');
  return (
    <Shell nav="live">
      <h1>משחקים</h1>
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
            <td><span className="pill ok">{MSTATUS[m.status]} {(m.sets as { a: number; b: number }[]).map((s) => `${s.a}-${s.b}`).join(' ')}</span></td>
            <td><Link href={`/tournaments/${t.id}`}>{t.name} · {c.name}</Link></td>
          </tr>)}
        </tbody></table>
        {!results.length && <p className="muted">אין עדיין תוצאות.</p>}
      </div>
    </Shell>
  );
}
