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

const AGES = [10, 12, 14, 16, 18];
const ST: Record<string, string> = { open: 'הרשמה פתוחה', soon: 'בקרוב', live: 'מתקיימת עכשיו', done: 'הסתיימה' };
const stGroup = (x: { status: string; endDate: Date }) =>
  x.status === 'REGISTRATION_OPEN' ? 'open' : x.status === 'IN_PROGRESS' ? 'live' : x.status === 'FINISHED' || x.status === 'CANCELLED' || x.endDate < new Date() ? 'done' : 'soon';

export default async function Home({ searchParams }: { searchParams: Promise<{ level?: string; season?: string; q?: string; g?: string; age?: string; st?: string }> }) {
  const t = await tr();
  const { level = '', season = '', q = '', g = '', age = '', st = '' } = await searchParams;
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
  const seasons = [...new Set(ts.map((x) => x.startDate.getFullYear()))].sort((a, b) => b - a);
  const shown = ts.filter((x) => {
    if (level && x.level !== level) return false;
    if (season && String(x.startDate.getFullYear()) !== season) return false;
    if (st && stGroup(x) !== st) return false;
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
  const filtered = !!(level || season || st || needle || g || age);
  const href = (o: { st?: string }) => `/?${new URLSearchParams({ level, season, q, g, age, st: o.st ?? st }).toString()}`;
  const c = (counts as unknown as { players: number; clubs: number; live: number }[])[0]!;
  return (
    <Shell nav="home">
      <section className="hero">
        <h1>{t('איגוד הטניס בישראל')}</h1>
        <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
        <div className="row" style={{ marginTop: 18, gap: 28 }}>
          <div className="stat"><b>{ts.length}</b><span style={{ color: '#CFE0F7' }}>{t('תחרויות')}</span></div>
          <div className="stat"><b>{c.players}</b><span style={{ color: '#CFE0F7' }}>{t('שחקנים')}</span></div>
          <div className="stat"><b>{c.clubs}</b><span style={{ color: '#CFE0F7' }}>{t('מועדונים')}</span></div>
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <Link className="btn" style={{ background: 'var(--lime)', color: '#0B2545', boxShadow: 'none' }} href="/live">{c.live ? `${c.live} ${t('משחקים חיים עכשיו')}` : t('משחקים ותוצאות')}</Link>
          <Link className="btn ghost" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} href="/rankings">{t('לדירוג')}</Link>
        </div>
      </section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{t('תחרויות')}</h2>
        {actor && can(actor, 'tournament.create') && <Link className="btn" href="/tournaments/new">{t('תחרות חדשה')}</Link>}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Link href={href({ st: '' })} className={`pill ${!st ? 'lime' : ''}`}>{t('הכול')}</Link>
        {Object.entries(ST).map(([k, v]) => <Link key={k} href={href({ st: k })} className={`pill ${st === k ? 'lime' : ''}`}>{t(v)}</Link>)}
      </div>
      <form className="card row" style={{ marginTop: 12 }}>
        <input type="hidden" name="st" value={st} />
        <input name="q" defaultValue={q} placeholder={t('חיפוש לפי שם תחרות')} style={{ flex: 1, minWidth: 180 }} />
        <select name="g" defaultValue={g}><option value="">{t('בנים ובנות')}</option><option value="MALE">{t('בנים')}</option><option value="FEMALE">{t('בנות')}</option></select>
        <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{AGES.map((a) => <option key={a} value={a}>{t('גיל')} {a}</option>)}</select>
        <select name="level" defaultValue={level}><option value="">{t('כל הסוגים')}</option>{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        {seasons.length > 1 && <select name="season" defaultValue={season}><option value="">{t('כל העונות')}</option>{seasons.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        <button className="btn">{t('סינון')}</button>
        {filtered && <Link className="btn ghost" href="/">{t('ניקוי')}</Link>}
      </form>
      <p className="muted" style={{ margin: '10px 0 0' }}>{shown.length} {t('תחרויות')}</p>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {shown.map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 8 }}>
            <span><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span></span>
            <strong style={{ fontSize: 18, lineHeight: 1.3 }}>{x.name}</strong>
            <span className="muted">{t(LEVEL[x.level] ?? '')}</span>
            <span className="muted">{x.startDate.toLocaleDateString('he-IL')} – {x.endDate.toLocaleDateString('he-IL')}</span>
            {x.status === 'REGISTRATION_OPEN' && x.registrationCloses && <span className="muted">{t('הרשמה עד')} {x.registrationCloses.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</span>}
          </Link>
        ))}
        {!shown.length && <div className="card muted">{filtered ? t('לא נמצאו תחרויות לפי הסינון.') : t('אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.')}</div>}
      </div>
    </Shell>
  );
}
