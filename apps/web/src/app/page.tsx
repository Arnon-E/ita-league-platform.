import { GetForm } from '@/components/GetForm';
import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@/db';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { homeCatalog } from '@/services/catalog';
import { getActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { fmtDate, LEVEL, STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { InfiniteCards } from '@/components/InfiniteCards';
import { Court } from '@/components/Brand';
import { Fold } from '@/components/Fold';
import { myHome, myPlayersForRelevance } from '@/services/home';
import { homeCounts, sectionOfBirthYear } from '@/services/public';
import { MyHome } from '@/components/MyHome';
import { relevantFor } from '@/services/eligibility';
import { abroadCatalog, entryState, phaseOf } from '@/services/abroad';
import { countryInfo } from '@/lib/countries';
import { Flag } from '@/components/Flag';

const AGES = [10, 12, 14, 16, 18];
const SEC: Record<string, string> = { YOUTH: 'נוער', ADULTS: 'בוגרים', MASTERS: 'מאסטרס', OTHER: 'אחר' };
const ST: Record<string, string> = { up: 'קרובות', open: 'הרשמה פתוחה', live: 'מתקיימת עכשיו', done: 'הסתיימה', all: 'הכול' };
const ACTION: Record<string, string> = { open: 'להרשמה', live: 'ללוח המשחקים', soon: 'פרטים', done: 'תוצאות' };
const stGroup = (x: { status: string; endDate: Date }) =>
  x.status === 'REGISTRATION_OPEN' ? 'open' : x.status === 'IN_PROGRESS' ? 'live' : x.status === 'FINISHED' || x.status === 'CANCELLED' || x.endDate < new Date() ? 'done' : 'soon';

export default async function Home({ searchParams }: { searchParams: Promise<{ level?: string; season?: string; q?: string; g?: string; age?: string; st?: string; sec?: string; rel?: string }> }) {
  const t = await tr();
  const { level = '', season = '', q = '', g = '', age = '', st = '', sec = '', rel = '' } = await searchParams;
  const [allTs, actor, counts] = await Promise.all([homeCatalog(db), getActor(), homeCounts(db)]);
  // people who run tournaments manage rather than register; they also get to see (and restore) cancelled ones
  const staff = !!actor && can(actor, 'tournament.create');
  // drafts are still being prepared, and a cancelled competition nobody had entered is not history worth showing: the public sees neither
  const ts = staff ? allTs : allTs.filter((x) => x.status !== 'DRAFT' && (x.status !== 'CANCELLED' || x.hasEntries));
  // Signed-in players and parents get a personal home: their standing, next match, results and what needs doing.
  const home = actor ? await myHome(db, actor).catch(() => null) : null;
  // junior tournaments abroad: the three whose entry closes first, and how many there are (a failure here must never break the home page)
  const abroadAll = (await abroadCatalog(db).catch(() => [])).filter((e) => !e.closed && phaseOf(e) === 'up');
  const abroadOpen = abroadAll.filter((e) => entryState(e) === 'open').sort((a, b) => +a.entryDeadline! - +b.entryDeadline!);
  const abroadCanEnter = abroadAll.filter((e) => ['open', 'soon'].includes(entryState(e))).length; // the same count the abroad page's "entry still open" shows
  // a player or parent sees the competitions that can apply to them; "show all" is one tap away
  const mine = await myPlayersForRelevance(db, actor).catch(() => []);
  const relevantOnly = mine.length > 0 && rel !== 'all';
  const relevantIds = new Set(ts.filter((x) => !mine.length || mine.some((p) => relevantFor(p, x, x.cats))).map((x) => x.id));
  const needle = q.trim().toLowerCase();
  // The section tabs (youth / adults / masters / all): the chosen one; a search by name looks at everything; otherwise the signed-in player's own section, else youth.
  const secKey = sec === 'ALL' || Object.keys(SEC).includes(sec) ? sec : needle ? 'ALL' : mine.length ? sectionOfBirthYear(Math.max(...mine.map((p) => p.birthDate.getUTCFullYear()))) : 'YOUTH';
  // Default view is what a visitor can act on: open, in progress and upcoming. Searching or picking a season looks at everything.
  const mode = st || (needle || season ? 'all' : 'up');
  const seasons = [...new Set(ts.map((x) => x.startDate.getFullYear()))].filter((y) => y >= 2000).sort((a, b) => b - a);
  const shown = ts.filter((x) => {
    if (level && x.level !== level) return false;
    if (secKey !== 'ALL' && x.section !== secKey) return false;
    if (season && String(x.startDate.getFullYear()) !== season) return false;
    const grp = stGroup(x);
    if (mode === 'up' ? grp === 'done' : mode !== 'all' && grp !== mode) return false;
    if (needle && !x.name.toLowerCase().includes(needle)) return false;
    // searching by name looks at everything, whatever the player's age
    if (relevantOnly && !(needle || level || sec || season || g || age) && !relevantIds.has(x.id)) return false;
    if (g || age) {
      const cs = x.cats;
      if (!cs.some((c) => (!g || c.gender === g) && (!age || c.age === Number(age)))) return false;
    }
    return true;
  }).sort((a, b) => {
    const rank = { open: 0, live: 1, soon: 2, done: 3 } as const;
    const ga = stGroup(a), gb = stGroup(b);
    if (ga !== gb) return rank[ga as keyof typeof rank] - rank[gb as keyof typeof rank];
    if (ga === 'open') return (a.registrationCloses?.getTime() ?? a.startDate.getTime()) - (b.registrationCloses?.getTime() ?? b.startDate.getTime());
    if (ga === 'done') return b.startDate.getTime() - a.startDate.getTime();
    return a.startDate.getTime() - b.startDate.getTime();
  });
  const filtered = !!(level || season || needle || g || age);
  // the featured registration, the counters and the tab counts follow the same relevance as the list
  const visibleTs = relevantOnly ? ts.filter((x) => relevantIds.has(x.id)) : ts;
  const nextOpen = visibleTs.filter((x) => x.status === 'REGISTRATION_OPEN').sort((a, b) => (a.registrationCloses?.getTime() ?? a.startDate.getTime()) - (b.registrationCloses?.getTime() ?? b.startDate.getTime()))[0];
  const closes = nextOpen ? (nextOpen.registrationCloses ?? nextOpen.startDate) : null;
  const left = closes ? Math.max(0, closes.getTime() - Date.now()) : 0;
  const inSec = visibleTs.filter((x) => secKey === 'ALL' || x.section === secKey);
  const counts2 = { up: inSec.filter((x) => stGroup(x) !== 'done').length, done: inSec.filter((x) => stGroup(x) === 'done').length };
  const dayMonth = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' });
  const href = (o: { st?: string }) => `/?${new URLSearchParams({ level, season, q, g, age, sec: sec || secKey, st: o.st ?? st }).toString()}`;
  const secHref = (k: string) => `/?${new URLSearchParams({ level, season, q, g, age, sec: k, st }).toString()}#list`;
  const openCount = visibleTs.filter((x) => x.status === 'REGISTRATION_OPEN').length;
  const c = (counts as unknown as { players: number; clubs: number; live: number }[])[0]!;
  return (
    <Shell nav="home">
      <section className="hero home-hero">
        <Court />
        <div>
          <h1>{t('איגוד הטניס בישראל')}</h1>
          <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
          <form action="/search" className="hsearch">
            <input name="q" placeholder={t('חיפוש תחרות, שחקן או מועדון')} aria-label={t('חיפוש')} />
            <button className="btn ink">{t('חיפוש')}</button>
          </form>
        </div>
        {nextOpen && closes && !staff && (
          <Link href={`/tournaments/${nextOpen.id}`} className="feat">
            <small>{t('ההרשמה פתוחה')}</small>
            <strong>{nextOpen.name}</strong>
            <span className="meta">{dayMonth(nextOpen.startDate)} – {dayMonth(nextOpen.endDate)} · {t(LEVEL[nextOpen.level] ?? '')}</span>
            <span className="count">
              <span><b>{Math.floor(left / 86400000)}</b>{t('ימים')}</span>
              <span><b>{Math.floor((left % 86400000) / 3600000)}</b>{t('שעות')}</span>
              <span className="till">{t('עד סגירת ההרשמה')}, {closes.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</span>
            </span>
            <span className="btn ink">{t('להרשמה')}</span>
          </Link>
        )}
      </section>
      <nav className="bento" aria-label={t('ניווט מהיר')}>
        {staff
          ? <Link href="/tournaments/new" className="pri"><span className="n">+</span><b>{t('תחרות חדשה')}</b><small>{openCount ? `${openCount} ${t('פתוחות להרשמה')}` : t('יצירת תחרות')}</small></Link>
          : <Link href="/?st=open#list" className="pri"><span className="n">{openCount}</span><b>{t('להירשם לתחרות')}</b><small>{openCount ? t('פתוחות עכשיו') : t('אין כרגע הרשמה פתוחה')}</small></Link>}
        <Link href="/live"><span className="n">{c.live}</span><b>{t('משחקים ותוצאות')}</b><small>{c.live ? t('משחקים חיים עכשיו') : t('לוחות ותוצאות')}</small></Link>
        <Link href="/rankings"><span className="n">{c.players.toLocaleString('he-IL')}</span><b>{t('דירוג')}</b><small>{t('שחקנים רשומים')}</small></Link>
        <Link href="/clubs"><span className="n">{c.clubs.toLocaleString('he-IL')}</span><b>{t('מועדונים')}</b><small>{t('מועדונים עם שחקנים')}</small></Link>
      </nav>
      {home && <MyHome home={home} t={t} />}
      <Fold id="list" title={t('תחרויות')}>
      {actor && can(actor, 'tournament.create') && <div className="row"><Link className="btn" href="/tournaments/new">{t('תחרות חדשה')}</Link></div>}
      <nav className="tabs" style={{ margin: '12px 0 0' }} aria-label={t('מקטע')}>
        {([['YOUTH', 'נוער'], ['ADULTS', 'בוגרים'], ['MASTERS', 'מאסטרס'], ['ALL', 'הכול']] as const).map(([k, label]) => <Link key={k} scroll={false} href={secHref(k)} className={secKey === k ? 'on' : ''}>{t(label)}</Link>)}
      </nav>
      <div className="row" style={{ marginTop: 12 }}>
        {Object.entries(ST).map(([k, v]) => (
          <Link scroll={false} key={k} href={href({ st: k })} className={`pill ${mode === k ? 'lime' : ''}`}>{t(v)}{k === 'up' ? ` ${counts2.up}` : k === 'done' ? ` ${counts2.done}` : ''}</Link>
        ))}
      </div>
      {mine.length > 0 && (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          {relevantOnly && !(needle || level || sec || season || g || age) ? `${t(home?.role === 'PLAYER' ? 'מוצגות תחרויות שמתאימות לך.' : home?.role === 'PARENT' ? 'מוצגות תחרויות שמתאימות לילדים שלך.' : 'מוצגות תחרויות שמתאימות לך ולילדים שלך.')} ${t('חיפוש או סינון מציגים את כולן.')} ` : ''}
          <Link href={relevantOnly ? '/?rel=all' : '/'}><u>{relevantOnly ? t('הצגת כל התחרויות') : t('רק תחרויות שמתאימות לי')}</u></Link>
        </p>
      )}
      <details className="filters" open={filtered}>
      <summary>{t('סינון')}{filtered ? ` · ${[level, season, needle, g, age].filter(Boolean).length}` : ''}</summary>
      <GetForm className="card row" style={{ marginTop: 8 }}>
        <input type="hidden" name="st" value={mode} />
        <select name="sec" defaultValue={secKey}><option value="ALL">{t('כל הקטגוריות')}</option>{Object.entries(SEC).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        <input name="q" defaultValue={q} placeholder={t('חיפוש לפי שם תחרות')} style={{ flex: 1, minWidth: 180 }} />
        <select name="g" defaultValue={g}><option value="">{t('בנים ובנות')}</option><option value="MALE">{t('בנים')}</option><option value="FEMALE">{t('בנות')}</option></select>
        <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{AGES.map((a) => <option key={a} value={a}>{t('גיל')} {a}</option>)}</select>
        <select name="level" defaultValue={level}><option value="">{t('כל הסוגים')}</option>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        {seasons.length > 1 && <select name="season" defaultValue={season}><option value="">{t('כל העונות')}</option>{seasons.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        <button className="btn">{t('הצגה')}</button>
        {filtered && <Link className="btn ghost" href="/">{t('ניקוי')}</Link>}
      </GetForm>
      </details>
      <p className="muted" style={{ margin: '10px 0 0' }}>{shown.length} {t('תחרויות')}</p>
      {shown.length ? (
        <InfiniteCards
          items={shown.map((x) => ({
            id: x.id, name: x.name, status: x.status, statusLabel: t(STATUS[x.status]?.[0] ?? x.status), statusCls: STATUS[x.status]?.[1] ?? '',
            level: t(LEVEL[x.level] ?? ''), dates: `${fmtDate(x.startDate)} – ${fmtDate(x.endDate)}`,
            group: stGroup(x), action: t(staff && stGroup(x) === 'open' ? 'ניהול' : ACTION[stGroup(x)] ?? 'פרטים'), day: String(x.startDate.getDate()), mon: x.startDate.toLocaleDateString('he-IL', { month: 'short' }),
            deadline: x.status === 'REGISTRATION_OPEN' && x.registrationCloses ? `${t('הרשמה עד')} ${x.registrationCloses.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}` : null,
          }))}
        />
      ) : (
        <div className="card muted" style={{ marginTop: 14 }}>
          {filtered ? t('לא נמצאו תחרויות לפי הסינון.')
            : relevantOnly ? <>{t('אין כרגע תחרויות שמתאימות לך.')} <Link href="/?rel=all"><u>{t('הצגת כל התחרויות')}</u></Link></>
            : mode === 'up' ? t('אין כרגע תחרויות קרובות. אפשר לעבור לארכיון או להציג הכול.')
            : actor && can(actor, 'tournament.create') ? t('אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.') : t('אין תחרויות להצגה.')}
        </div>
      )}
      </Fold>
      {abroadAll.length > 0 && (
        <Fold id="abroad" title={t('תחרויות חו"ל')}>
          <p className="muted" style={{ margin: 0 }}>{t('טורנירי נוער של Tennis Europe: מתי ואיפה, עד מתי אפשר להירשם ומה התנאים.')}</p>
          {abroadOpen.length > 0 && (
            <div className="grid cols" style={{ marginTop: 14 }}>
              {abroadOpen.slice(0, 3).map((e) => (
                <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="card grid comp open" style={{ gap: 8 }}>
                  <span className="top"><span className="pill ok">{t('פתוחה להרשמה')}</span><span className="muted">{[e.age ? `U${e.age}` : '', e.category].filter(Boolean).join(' · ')}</span></span>
                  <strong style={{ fontSize: 17, lineHeight: 1.3 }}>{e.name}</strong>
                  <span className="muted"><Flag country={e.country} /> {[e.city, t(countryInfo(e.country).he)].filter(Boolean).join(', ')} · {dayMonth(e.start)} – {fmtDate(e.end)}</span>
                  <span className="foot"><span className="muted">{t('הרשמה עד')} {e.entryDeadline!.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className="act primary">{t('לדף הטורניר')}</span></span>
                </a>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <Link className="btn" href="/abroad">{t('לכל התחרויות בחו"ל')} · {abroadAll.length}</Link>
            {abroadCanEnter > 0 && <Link className="btn ghost" href="/abroad?st=open">{t('רק כאלה שעוד אפשר להירשם אליהן')} · {abroadCanEnter}</Link>}
          </div>
        </Fold>
      )}
    </Shell>
  );
}
