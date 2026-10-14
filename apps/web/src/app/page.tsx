import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { schema } from '@/db';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { listTournaments } from '@/services/queries';
import { getActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { LEVEL, STATUS } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { InfiniteCards } from '@/components/InfiniteCards';

const AGES = [10, 12, 14, 16, 18];
const SEC: Record<string, string> = { YOUTH: 'נוער', ADULTS: 'בוגרים', MASTERS: 'מאסטרס', OTHER: 'אחר' };
const ST: Record<string, string> = { up: 'קרובות', open: 'הרשמה פתוחה', live: 'מתקיימת עכשיו', done: 'הסתיימה', all: 'הכול' };
const ACTION: Record<string, string> = { open: 'להרשמה', live: 'ללוח המשחקים', soon: 'פרטים', done: 'תוצאות' };
const stGroup = (x: { status: string; endDate: Date }) =>
  x.status === 'REGISTRATION_OPEN' ? 'open' : x.status === 'IN_PROGRESS' ? 'live' : x.status === 'FINISHED' || x.status === 'CANCELLED' || x.endDate < new Date() ? 'done' : 'soon';

export default async function Home({ searchParams }: { searchParams: Promise<{ level?: string; season?: string; q?: string; g?: string; age?: string; st?: string; sec?: string }> }) {
  const t = await tr();
  const { level = '', season = '', q = '', g = '', age = '', st = '', sec = '' } = await searchParams;
  const [ts, actor, counts, cats] = await Promise.all([
    listTournaments(db),
    getActor(),
    db.execute(sql`select (select count(*) from players)::int as players, (select count(*) from clubs)::int as clubs,
      (select count(*) from matches where live and status = 'SCHEDULED')::int as live`),
    db.select({ tid: schema.categories.tournamentId, gender: schema.categories.gender, name: schema.categories.name }).from(schema.categories),
  ]);
  const catsOf = new Map<string, { gender: string; age: number | null }[]>();
  for (const c of cats) {
    const a = c.name.match(/(\d{2})/);
    const list = catsOf.get(c.tid) ?? [];
    list.push({ gender: c.gender, age: a ? Number(a[1]) : null });
    catsOf.set(c.tid, list);
  }
  const needle = q.trim().toLowerCase();
  // Default view is what a visitor can act on: open, in progress and upcoming. Searching or picking a season looks at everything.
  const mode = st || (needle || season ? 'all' : 'up');
  const seasons = [...new Set(ts.map((x) => x.startDate.getFullYear()))].sort((a, b) => b - a);
  const shown = ts.filter((x) => {
    if (level && x.level !== level) return false;
    if (sec && x.section !== sec) return false;
    if (season && String(x.startDate.getFullYear()) !== season) return false;
    const grp = stGroup(x);
    if (mode === 'up' ? grp === 'done' : mode !== 'all' && grp !== mode) return false;
    if (needle && !x.name.toLowerCase().includes(needle)) return false;
    if (g || age) {
      const cs = catsOf.get(x.id) ?? [];
      if (!cs.some((c) => (!g || c.gender === g) && (!age || c.age === Number(age)))) return false;
    }
    return true;
  }).sort((a, b) => {
    const ao = a.status === 'REGISTRATION_OPEN', bo = b.status === 'REGISTRATION_OPEN';
    if (ao !== bo) return ao ? -1 : 1;
    if (ao && bo) return (a.registrationCloses?.getTime() ?? a.startDate.getTime()) - (b.registrationCloses?.getTime() ?? b.startDate.getTime());
    return b.startDate.getTime() - a.startDate.getTime();
  });
  const filtered = !!(level || season || needle || g || age || sec);
  const nextOpen = ts.filter((x) => x.status === 'REGISTRATION_OPEN').sort((a, b) => (a.registrationCloses?.getTime() ?? a.startDate.getTime()) - (b.registrationCloses?.getTime() ?? b.startDate.getTime()))[0];
  const closes = nextOpen ? (nextOpen.registrationCloses ?? nextOpen.startDate) : null;
  const left = closes ? Math.max(0, closes.getTime() - Date.now()) : 0;
  const counts2 = { up: ts.filter((x) => stGroup(x) !== 'done').length, done: ts.filter((x) => stGroup(x) === 'done').length };
  const dayMonth = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', timeZone: 'Asia/Jerusalem' });
  const href = (o: { st?: string }) => `/?${new URLSearchParams({ level, season, q, g, age, sec, st: o.st ?? st }).toString()}`;
  const c = (counts as unknown as { players: number; clubs: number; live: number }[])[0]!;
  return (
    <Shell nav="home">
      <section className="hero home-hero">
        <div>
          <h1>{t('איגוד הטניס בישראל')}</h1>
          <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
          <form action="/search" className="hsearch">
            <input name="q" placeholder={t('חיפוש תחרות, שחקן או מועדון')} aria-label={t('חיפוש')} />
            <button className="btn" style={{ background: 'var(--lime)', color: '#0B2545', boxShadow: 'none' }}>{t('חיפוש')}</button>
          </form>
          <div className="row" style={{ marginTop: 18, gap: 28 }}>
            <a href="#list" className="stat"><b>{ts.length}</b><span style={{ color: '#CFE0F7' }}>{t('תחרויות')}</span></a>
            <Link href="/players" className="stat"><b>{c.players.toLocaleString('he-IL')}</b><span style={{ color: '#CFE0F7' }}>{t('שחקנים')}</span></Link>
            <Link href="/clubs" className="stat"><b>{c.clubs.toLocaleString('he-IL')}</b><span style={{ color: '#CFE0F7' }}>{t('מועדונים')}</span></Link>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            <Link className="btn ghost" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} href="/live">{c.live ? `${c.live} ${t('משחקים חיים עכשיו')}` : t('משחקים ותוצאות')}</Link>
            <Link className="btn ghost" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} href="/rankings">{t('לדירוג')}</Link>
          </div>
        </div>
        {nextOpen && closes && (
          <Link href={`/tournaments/${nextOpen.id}`} className="feat">
            <small>{t('ההרשמה פתוחה')}</small>
            <strong>{nextOpen.name}</strong>
            <span className="meta">{dayMonth(nextOpen.startDate)} – {dayMonth(nextOpen.endDate)} · {t(LEVEL[nextOpen.level] ?? '')}</span>
            <span className="count">
              <span><b>{Math.floor(left / 86400000)}</b>{t('ימים')}</span>
              <span><b>{Math.floor((left % 86400000) / 3600000)}</b>{t('שעות')}</span>
              <span className="till">{t('עד סגירת ההרשמה')}, {closes.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</span>
            </span>
            <span className="btn" style={{ background: 'var(--lime)', color: '#0B2545', boxShadow: 'none' }}>{t('להרשמה')}</span>
          </Link>
        )}
      </section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="list" style={{ margin: 0 }}>{t('תחרויות')}</h2>
        {actor && can(actor, 'tournament.create') && <Link className="btn" href="/tournaments/new">{t('תחרות חדשה')}</Link>}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {Object.entries(ST).map(([k, v]) => (
          <Link key={k} href={href({ st: k })} className={`pill ${mode === k ? 'lime' : ''}`}>{t(v)}{k === 'up' ? ` ${counts2.up}` : k === 'done' ? ` ${counts2.done}` : ''}</Link>
        ))}
      </div>
      <form className="card row" style={{ marginTop: 12 }}>
        <input type="hidden" name="st" value={mode} />
        <select name="sec" defaultValue={sec}><option value="">{t('כל הקטגוריות')}</option>{Object.entries(SEC).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        <input name="q" defaultValue={q} placeholder={t('חיפוש לפי שם תחרות')} style={{ flex: 1, minWidth: 180 }} />
        <select name="g" defaultValue={g}><option value="">{t('בנים ובנות')}</option><option value="MALE">{t('בנים')}</option><option value="FEMALE">{t('בנות')}</option></select>
        <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{AGES.map((a) => <option key={a} value={a}>{t('גיל')} {a}</option>)}</select>
        <select name="level" defaultValue={level}><option value="">{t('כל הסוגים')}</option>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        {seasons.length > 1 && <select name="season" defaultValue={season}><option value="">{t('כל העונות')}</option>{seasons.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        <button className="btn">{t('סינון')}</button>
        {filtered && <Link className="btn ghost" href="/">{t('ניקוי')}</Link>}
      </form>
      <p className="muted" style={{ margin: '10px 0 0' }}>{shown.length} {t('תחרויות')}</p>
      {shown.length ? (
        <InfiniteCards
          items={shown.map((x) => ({
            id: x.id, name: x.name, status: x.status, statusLabel: t(STATUS[x.status]?.[0] ?? x.status), statusCls: STATUS[x.status]?.[1] ?? '',
            level: t(LEVEL[x.level] ?? ''), dates: `${x.startDate.toLocaleDateString('he-IL')} – ${x.endDate.toLocaleDateString('he-IL')}`,
            group: stGroup(x), action: t(ACTION[stGroup(x)] ?? 'פרטים'), day: String(x.startDate.getDate()), mon: x.startDate.toLocaleDateString('he-IL', { month: 'short' }),
            deadline: x.status === 'REGISTRATION_OPEN' && x.registrationCloses ? `${t('הרשמה עד')} ${x.registrationCloses.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}` : null,
          }))}
        />
      ) : (
        <div className="card muted" style={{ marginTop: 14 }}>
          {filtered ? t('לא נמצאו תחרויות לפי הסינון.') : mode === 'up' ? t('אין כרגע תחרויות קרובות. אפשר לעבור לארכיון או להציג הכול.') : t('אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.')}
        </div>
      )}
    </Shell>
  );
}
