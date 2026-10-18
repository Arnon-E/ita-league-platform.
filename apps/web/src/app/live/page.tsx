import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { liveFeed } from '@/services/public';
import { fmtTime, MSTATUS, fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { AutoRefresh } from '@/components/AutoRefresh';
import { MatchScore, matchWhen } from '@/components/MatchScore';

export default async function Live() {
  const t0 = await tr();
  const { live, upcoming, results, names } = await liveFeed(db);
  const nm = (id: string | null) => (id ? names.get(id) ?? '?' : '—');
  return (
    <Shell nav="live">
      <h1>{t0('משחקים')}</h1>
      <AutoRefresh seconds={30} />
      {live.length > 0 && <>
        <h2>{t0('משחקים חיים')}</h2>
        <div className="grid cols">
          {live.map(({ m, c, t }) => <Link key={m.id} href={`/matches/${m.id}`} className="card grid" style={{ gap: 4 }}><span className="pill lime" style={{ width: 'fit-content' }}>חי{m.courtLabel ? ` · מגרש ${m.courtLabel}` : ''}</span><strong>{nm(m.aEntryId)} – {nm(m.bEntryId)}</strong><strong style={{ fontSize: 22 }}>{fmtScore(m.sets as { a: number; b: number }[])}</strong><span className="muted">{t.name} · {c.name}</span></Link>)}
        </div>
      </>}
      <h2>{t0('משחקים קרובים')}</h2>
      <div className="card ulist">
        {upcoming.map(({ m, c, t }) => (
          <div key={m.id} className="urow">
            <span className="utime">{fmtTime(m.scheduledStart)}</span>
            <span className="umain">
              <Link href={`/matches/${m.id}`}><strong>{nm(m.aEntryId)} – {nm(m.bEntryId)}</strong></Link>
              <Link href={`/tournaments/${t.id}`} className="muted">{t.name} · {c.name}</Link>
            </span>
            <span className={`ucourt ${m.courtLabel ? '' : 'muted'}`}>{m.courtLabel ? `${t0('מגרש')} ${m.courtLabel}` : t0('יוקצה בבוקר')}</span>
          </div>
        ))}
        {!upcoming.length && <p className="muted">{t0('אין משחקים מתוכננים.')}</p>}
      </div>
      <h2>{t0('תוצאות אחרונות')}</h2>
      <div className="sbgrid">
        {results.map(({ m, c, t }) => (
          <MatchScore key={m.id} href={`/matches/${m.id}`} aName={nm(m.aEntryId)} bName={nm(m.bEntryId)} sets={m.sets as { a: number; b: number }[]}
            status={m.status} winner={m.winnerEntryId ? (m.winnerEntryId === m.aEntryId ? 'a' : m.winnerEntryId === m.bEntryId ? 'b' : null) : null}
            caption={`${t.name} · ${c.name}`} when={matchWhen(m.scheduledStart ?? m.notBefore, m.scheduleKind === 'NOT_BEFORE' ? 'NB' : m.scheduleKind === 'EXACT' ? 'St' : null)}
            labels={{ walkover: t0('ווק-אובר'), retired: t0('פרישה'), void: t0('בוטל'), live: t0('חי'), won: t0('ניצח') }} />
        ))}
      </div>
      {!results.length && <p className="muted">{t0('אין עדיין תוצאות.')}</p>}
    </Shell>
  );
}
