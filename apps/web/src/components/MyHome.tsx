import Link from 'next/link';
import type { myHome } from '@/services/home';
import { fmtDate, fmtTime } from '@/components/labels';
import { MatchScore, matchWhen } from '@/components/MatchScore';

type Home = Awaited<ReturnType<typeof myHome>>;
const DOC: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };

type Result = Home['people'][number]['results'][number];

/** A latest result on the shared match card (singles link to the match; doubles have no page of their own). */
function ResultCard({ r, t }: { r: Result; t: (s: string) => string }) {
  const card = (
    <MatchScore aName={r.a} bName={r.b} sets={r.sets} status={r.status} winner={r.winner} mine={r.mine} href={r.doubles ? undefined : `/matches/${r.id}`}
      caption={`${r.tournament} · ${r.category}`} when={matchWhen(r.start, r.kind)}
      labels={{ walkover: t('ווק-אובר'), retired: t('פרישה'), void: t('בוטל'), live: t('חי'), won: t('ניצח') }} />
  );
  return r.doubles ? <div className="card sbcard">{card}</div> : card;
}

/** Personal home for a signed-in player and/or parent: one card per player profile, with what that person cares about. */
export function MyHome({ home, t }: { home: Home; t: (s: string) => string }) {
  const { work } = home;
  if (home.role === 'NONE' && !work) return null;
  const parent = home.role !== 'PLAYER';
  return (
    <section className="myhome" aria-label={t('הבית שלי')}>
      {work && <Work work={work} t={t} />}
      {home.people.length > 0 && <h2 style={{ marginTop: work ? 18 : 0 }}>{t(home.role === 'PLAYER' ? 'הבית שלי' : home.role === 'PARENT' ? 'הילדים שלי' : 'אני והילדים')}</h2>}
      <div className="grid cols">
        {home.people.map((p) => (
          <article key={p.id} className="card mh">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="pavatar" aria-hidden style={{ width: 48, height: 48, fontSize: 18 }}>{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
              <div style={{ minWidth: 0 }}>
                <Link href={`/players/${p.id}`} className="mh-name"><strong style={{ fontSize: 18 }}>{p.name}</strong></Link>
                <div className="muted">{p.relation === 'CHILD' ? `${t('ילד/ה')} · ` : ''}{t('גיל')} {p.age}{p.club ? ` · ${p.club}` : ''}</div>
                {p.relation === 'CHILD' && <Link href="/me" className="muted"><u>{p.childLogin ? `${t('כניסה לילד/ה')}: ${p.childLogin}` : t('יצירת כניסה לילד/ה')}</u></Link>}
              </div>
            </div>
            <div className="mh-stats">
              <Link href="/rankings"><b>{p.rank ? `#${p.rank}` : '—'}</b><small>{t('דירוג')}</small></Link>
              <span><b>{p.points}</b><small>{t('נקודות')}</small></span>
              <span><b dir="ltr">{p.wins}/{p.losses}</b><small>{t('נצ׳/הפ׳')}</small></span>
              {p.form.length > 0 && <span className="pform" aria-label={t('משחקים אחרונים')}>{p.form.map((w, i) => <i key={i} className={w ? 'w' : 'l'}>{t(w ? 'נ' : 'ה')}</i>)}</span>}
            </div>
            {!home.isChild && p.todo.length > 0 && (
              <div className="mh-todo">
                {p.todo.map((x, i) => x.startsWith('DOCS:')
                  ? <Link key={i} href="/me" className="pill warn">{t('חסר')}: {x.slice(5).split(',').map((m) => DOC[m] ?? m).join(', ')}</Link>
                  : <Link key={i} href="/me" className="pill warn">{t('ממתין לתשלום')}: {x.slice(4)}</Link>)}
              </div>
            )}
            {p.nextMatch && (
              <div className="mh-row"><small className="muted">{t('המשחק הבא')}</small>
                <strong>{p.nextMatch.opponent ?? t('יתברר')}</strong>
                <span className="muted">{p.nextMatch.tournament}{p.nextMatch.start ? ` · ${fmtTime(new Date(p.nextMatch.start))}` : ''}{p.nextMatch.court ? ` · ${t('מגרש')} ${p.nextMatch.court}` : ''}</span>
              </div>
            )}
            {p.nextTournament && (
              <div className="mh-row"><small className="muted">{t('התחרות הבאה')}</small>
                <Link href={`/tournaments/${p.nextTournament.id}`}><strong>{p.nextTournament.name}</strong></Link>
                <span className="muted">{fmtDate(new Date(p.nextTournament.start))} · {p.nextTournament.category}</span>
              </div>
            )}
            {p.results.length > 0 && (
              <div className="mh-row"><small className="muted">{t('תוצאות אחרונות')}</small>
                <div className="sbgrid mh-results">{p.results.map((r) => <ResultCard key={r.id} r={r} t={t} />)}</div>
              </div>
            )}
            {p.canRegister.length > 0 && (
              <div className="mh-row"><small className="muted">{t(home.isChild ? 'אפשר להציע להורה' : 'אפשר להירשם')}</small>
                {p.canRegister.slice(0, 3).map((r) => <Link key={r.categoryId} href={`/tournaments/${r.tournamentId}`} className="pill lime">{r.tournament} · {r.category}</Link>)}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

type WorkT = NonNullable<Home['work']>;
function Work({ work, t }: { work: WorkT; t: (s: string) => string }) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{t(work.kind === 'ADMIN' ? 'מה מחכה לטיפול' : work.kind === 'CLUB' ? 'המועדון שלי' : 'התחרויות שלי')}</h2>
      {work.admin && (
        <div className="mh-stats">
          <Link href="/admin/documents"><b>{work.admin.pendingDocs}</b><small>{t('מסמכים לאישור')}</small></Link>
          <Link href="/admin/claims"><b>{work.admin.pendingClaims}</b><small>{t('בקשות שיוך')}</small></Link>
          <Link href="/?st=open"><b>{work.admin.openRegistration}</b><small>{t('הרשמה פתוחה')}</small></Link>
          <Link href="/?st=live"><b>{work.admin.inProgress}</b><small>{t('מתקיימות')}</small></Link>
        </div>
      )}
      {work.tournaments.length > 0 && (
        <div className="grid cols">
          {work.tournaments.map((x) => (
            <Link key={x.id} href={`/tournaments/${x.id}`} className="card mh">
              <strong>{x.name}</strong>
              <span className="muted">{fmtDate(new Date(x.start))} – {fmtDate(new Date(x.end))}</span>
              <span className="row"><span className={`pill ${x.waiting ? 'warn' : 'ok'}`}>{x.waiting ? `${x.waiting} ${t('משחקים ממתינים לתוצאה')}` : t('אין משחקים ממתינים')}</span><span className="pill">{x.upcoming} {t('משחקים פתוחים')}</span></span>
            </Link>
          ))}
        </div>
      )}
      {work.kind !== 'ADMIN' && work.kind !== 'CLUB' && work.tournaments.length === 0 && <p className="muted">{t('לא שובצת כרגע לתחרות פעילה.')}</p>}
      {work.club && (
        <div className="card mh">
          <Link href={`/clubs/${work.club.id}`}><strong style={{ fontSize: 18 }}>{work.club.name}</strong></Link>
          <div className="mh-stats">
            <span><b>{work.club.players}</b><small>{t('שחקנים')}</small></span>
            <span><b>{work.club.upcomingEntries}</b><small>{t('הרשמות ב-90 הימים הקרובים')}</small></span>
          </div>
          {work.club.top.length > 0 && <div className="mh-row"><small className="muted">{t('המדורגים במועדון')}</small>{work.club.top.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="mh-res"><b>#{p.rank}</b><span>{p.name}</span><span className="muted">{p.points}</span></Link>)}</div>}
        </div>
      )}
    </div>
  );
}
