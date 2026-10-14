import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { FollowButton } from '@/components/FollowButton';
import { requireActor } from '@/lib/session';
import { followedOverview } from '@/services/follows';
import { fmtTime } from '@/components/labels';
import { STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';

/** The fan's own area: the players, clubs and competitions they follow, with the latest results and the next match of each player. */
export default async function Following() {
  const t = await tr();
  const actor = await requireActor();
  const o = await followedOverview(db, actor.id);
  const empty = !o.players.length && !o.clubs.length && !o.tournaments.length;
  return (
    <Shell nav="following">
      <h1>{t('המעקב שלי')}</h1>
      <p className="muted">{t('שחקנים, מועדונים ותחרויות שאתם עוקבים אחריהם. תקבלו התראה על שינויי לוח משחקים ותוצאות.')}</p>
      {empty && (
        <div className="card grid" style={{ marginTop: 14, gap: 10 }}>
          <strong>{t('עדיין לא עוקבים אחרי אף אחד')}</strong>
          <span className="muted">{t('חפשו שחקן או מועדון ולחצו "מעקב" בעמוד שלו.')}</span>
          <span className="row"><Link className="btn" href="/search">{t('חיפוש')}</Link><Link className="btn ghost" href="/rankings">{t('לדירוג')}</Link></span>
        </div>
      )}
      {o.players.length > 0 && <h2>{t('שחקנים')}</h2>}
      <div className="grid" style={{ gap: 14 }}>
        {o.players.map((p) => (
          <section key={p.id} className="card grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <span className="pavatar" aria-hidden>{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                <span style={{ minWidth: 0 }}>
                  <Link href={`/players/${p.id}`}><strong style={{ fontSize: 18 }}>{p.name}</strong></Link>
                  <div className="muted">{p.club ? (p.clubId ? <Link href={`/clubs/${p.clubId}`}>{p.club}</Link> : p.club) : t('ללא מועדון')}</div>
                </span>
              </span>
              <FollowButton kind="PLAYER" target={p.id} back="/following" />
            </div>
            <div className="row" style={{ gap: 24 }}>
              <div className="stat"><b style={{ fontSize: 24 }}>{p.rank ? `#${p.rank}` : '—'}</b><span className="muted">{t('דירוג')}</span></div>
              <div className="stat"><b style={{ fontSize: 24 }}>{p.points}</b><span className="muted">{t('נקודות')}</span></div>
              {p.recent.length > 0 && <div className="stat"><span className="pform">{p.recent.map((r) => <i key={r.id} className={r.won ? 'w' : 'l'}>{r.won ? 'נ' : 'ה'}</i>)}</span><span className="muted">{t('משחקים אחרונים')}</span></div>}
            </div>
            {p.next && (
              <Link href={`/matches/${p.next.id}`} className="card" style={{ background: 'var(--surface2)', boxShadow: 'none' }}>
                <span className="muted">{t('המשחק הבא')}</span>
                <div><strong>{t('נגד')} {p.next.vs}</strong> <span className="muted">· {fmtTime(p.next.when)}{p.next.court ? ` · ${t('מגרש')} ${p.next.court}` : ` · ${t('יוקצה בבוקר')}`}</span></div>
                <span className="muted">{p.next.competition}</span>
              </Link>
            )}
            {p.recent.length > 0 ? (
              <div className="ulist card" style={{ boxShadow: 'none' }}>
                {p.recent.map((r) => (
                  <Link key={r.id} href={`/matches/${r.id}`} className="urow" style={{ gridTemplateColumns: '56px 1fr auto' }}>
                    <span className={`pill ${r.won ? 'ok' : 'bad'}`}>{r.won ? t('ניצחון') : t('הפסד')}</span>
                    <span className="umain"><strong>{t('נגד')} {r.vs}</strong><span className="muted">{r.competition}</span></span>
                    <span dir="ltr" className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>
                  </Link>
                ))}
              </div>
            ) : <span className="muted">{t('עדיין אין תוצאות לשחקן הזה.')}</span>}
          </section>
        ))}
      </div>
      {o.tournaments.length > 0 && <h2>{t('תחרויות')}</h2>}
      <div className="grid cols">
        {o.tournaments.map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 6 }}>
            <span><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span></span>
            <strong>{x.name}</strong>
            <span className="muted">{x.startDate.toLocaleDateString('he-IL')} – {x.endDate.toLocaleDateString('he-IL')}</span>
          </Link>
        ))}
      </div>
      {o.clubs.length > 0 && <h2>{t('מועדונים')}</h2>}
      <div className="grid cols">
        {o.clubs.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="card"><strong>{c.name}</strong></Link>)}
      </div>
    </Shell>
  );
}
