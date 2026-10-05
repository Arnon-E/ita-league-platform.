import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { liveFeed } from '@/services/public';
import { fmtTime, MSTATUS, fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';

export default async function Live() {
  const t0 = await tr();
  const { live, upcoming, results, names } = await liveFeed(db);
  const nm = (id: string | null) => (id ? names.get(id) ?? '?' : '—');
  return (
    <Shell nav="live">
      <h1>{t0('משחקים')}</h1>
      <meta httpEquiv="refresh" content="30" />
      {live.length > 0 && <>
        <h2>{t0('משחקים חיים')}</h2>
        <div className="grid cols">
          {live.map(({ m, c, t }) => <Link key={m.id} href={`/matches/${m.id}`} className="card grid" style={{ gap: 4 }}><span className="pill lime" style={{ width: 'fit-content' }}>חי{m.courtLabel ? ` · מגרש ${m.courtLabel}` : ''}</span><strong>{nm(m.aEntryId)} – {nm(m.bEntryId)}</strong><strong style={{ fontSize: 22 }}>{fmtScore(m.sets as { a: number; b: number }[])}</strong><span className="muted">{t.name} · {c.name}</span></Link>)}
        </div>
      </>}
      <h2>{t0('משחקים קרובים')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t0('שעה')}</th><th>{t0('מגרש')}</th><th>{t0('משחק')}</th><th>{t0('תחרות')}</th></tr></thead><tbody>
          {upcoming.map(({ m, c, t }) => <tr key={m.id}><td>{fmtTime(m.scheduledStart)}</td><td>{m.courtLabel ?? '—'}</td><td><Link href={`/matches/${m.id}`}>{nm(m.aEntryId)} – {nm(m.bEntryId)}</Link></td><td><Link href={`/tournaments/${t.id}`}>{t.name} · {c.name}</Link></td></tr>)}
        </tbody></table>
        {!upcoming.length && <p className="muted">{t0('אין משחקים מתוכננים.')}</p>}
      </div>
      <h2>{t0('תוצאות אחרונות')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t0('משחק')}</th><th>{t0('תוצאה')}</th><th>{t0('תחרות')}</th></tr></thead><tbody>
          {results.map(({ m, c, t }) => <tr key={m.id}>
            <td><Link href={`/matches/${m.id}`}>{nm(m.aEntryId)} – {nm(m.bEntryId)}</Link></td>
            <td><span className="pill ok">{t0(MSTATUS[m.status] ?? '')} {fmtScore(m.sets as { a: number; b: number }[])}</span></td>
            <td><Link href={`/tournaments/${t.id}`}>{t.name} · {c.name}</Link></td>
          </tr>)}
        </tbody></table>
        {!results.length && <p className="muted">{t0('אין עדיין תוצאות.')}</p>}
      </div>
    </Shell>
  );
}
