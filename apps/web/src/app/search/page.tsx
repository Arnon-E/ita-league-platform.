import { GetForm } from '@/components/GetForm';
import Link from 'next/link';
import { and, asc, desc, gte, ilike, inArray, lte, or, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { searchPlayers } from '@/services/public';
import { fmtDate, STATUS } from '@/components/labels';
import { photoUrl } from '@/lib/photos';
import { tr } from '@/lib/i18n';
import { getActor } from '@/lib/session';
import { ownedPlayerIds } from '@/services/entries';

const DAY = 86_400_000;

/** Quick searches for when nothing has been typed yet. Each one is a plain link, so it also works shared or bookmarked. */
const SHORTCUTS = [
  { key: 'recent', label: 'תחרויות בשנה האחרונה', hint: 'מהחדשה לישנה' },
  { key: 'open', label: 'הרשמה פתוחה וקרובות', hint: 'מה אפשר לעשות עכשיו' },
  { key: 'masters', label: 'מאסטרס ובוגרים', hint: 'בשנה האחרונה, בלי קשר לגיל' },
] as const;

/** One box over players, clubs and tournaments, plus a few ready-made searches. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const t = await tr();
  const { q = '', show = '' } = await searchParams;
  const term = q.trim();
  const actor = await getActor();
  const mineIds = actor ? await ownedPlayerIds(db, actor).catch(() => [] as string[]) : [];
  const shortcuts = mineIds.length ? [...SHORTCUTS, { key: 'mine', label: 'התחרויות שלי', hint: 'של השחקנים בחשבון' }] : [...SHORTCUTS];

  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const T = schema.tournaments;
  const byShortcut = async () => {
    if (show === 'recent') return db.select().from(T).where(and(gte(T.endDate, yearAgo), lte(T.startDate, new Date(now.getTime() + 365 * DAY)))).orderBy(desc(T.startDate)).limit(60);
    if (show === 'open') return db.select().from(T).where(or(eq(T.status, 'REGISTRATION_OPEN'), and(gte(T.startDate, now), inArray(T.status, ['REGISTRATION_CLOSED', 'DRAWN', 'IN_PROGRESS'])))).orderBy(asc(T.startDate)).limit(60);
    if (show === 'masters') return db.select().from(T).where(and(inArray(T.section, ['MASTERS', 'ADULTS']), gte(T.endDate, yearAgo))).orderBy(desc(T.startDate)).limit(60);
    if (show === 'mine' && mineIds.length) {
      const rows = await db.selectDistinct({ t: T }).from(schema.entries)
        .innerJoin(schema.categories, eq(schema.categories.id, schema.entries.categoryId)).innerJoin(T, eq(T.id, schema.categories.tournamentId))
        .where(inArray(schema.entries.playerId, mineIds)).orderBy(desc(T.startDate)).limit(60);
      return rows.map((r) => r.t);
    }
    return null;
  };

  const [players, clubs, byName, preset] = term
    ? await Promise.all([
        searchPlayers(db, term, undefined, 20),
        db.select().from(schema.clubs).where(ilike(schema.clubs.name, `%${term}%`)).limit(20),
        db.select().from(T).where(ilike(T.name, `%${term}%`)).limit(20),
        Promise.resolve(null),
      ])
    : [[], [], [], await byShortcut()];
  const ts = byName.length ? byName : preset ?? [];
  const none = term && !players.length && !clubs.length && !ts.length;
  const active = shortcuts.find((s) => s.key === show);
  const card = (x: (typeof ts)[number]) => (
    <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 6 }}>
      <strong>{x.name}</strong>
      <span className="row"><span className={`pill ${STATUS[x.status]?.[1] ?? ''}`}>{t(STATUS[x.status]?.[0] ?? x.status)}</span><span className="muted">{fmtDate(x.startDate)}</span></span>
    </Link>
  );
  return (
    <Shell nav="search">
      <h1>{t('חיפוש')}</h1>
      <GetForm className="row" style={{ margin: '12px 0 4px' }}>
        <input name="q" defaultValue={q} placeholder={t('שחקנים, מועדונים, תחרויות')} autoFocus style={{ flex: 1, minWidth: 200 }} />
        <button className="btn">{t('חיפוש')}</button>
      </GetForm>
      <div className="row" style={{ margin: '10px 0 0' }} aria-label={t('חיפושים מהירים')}>
        {shortcuts.map((s) => <Link scroll={false} key={s.key} href={`/search?show=${s.key}`} className={`pill ${!term && show === s.key ? 'lime' : ''}`} title={t(s.hint)}>{t(s.label)}</Link>)}
      </div>
      {none && <div className="card muted" style={{ marginTop: 14 }}>{t('לא נמצאו תוצאות עבור')} &quot;{term}&quot;.</div>}
      {!term && !show && <p className="muted" style={{ marginTop: 14 }}>{t('אפשר להקליד שם של שחקן, מועדון או תחרות, או לבחור אחד מהחיפושים המהירים.')}</p>}
      {!term && active && <h2>{t(active.label)} ({ts.length})</h2>}
      {!term && active && !ts.length && <div className="card muted">{t('אין תחרויות להצגה.')}</div>}
      {ts.length > 0 && <>{term && <h2>{t('תחרויות')}</h2>}<div className="grid cols">{ts.map(card)}</div></>}
      {players.length > 0 && <><h2>{t('שחקנים')}</h2><div className="grid cols">{players.map(({ p, club }) => {
        const age = Math.floor((now.getTime() - p.birthDate.getTime()) / (365.25 * DAY));
        const kind = p.gender === 'FEMALE' ? (age < 18 ? 'בת' : 'אישה') : p.gender === 'MALE' ? (age < 18 ? 'בן' : 'גבר') : '';
        return (
          <Link key={p.id} href={`/players/${p.id}`} className="card row" style={{ gap: 12, flexWrap: 'nowrap' }}>
            {photoUrl(p.photo) ? <img className="pavatar-img" style={{ width: 56, height: 56 }} src={photoUrl(p.photo)!} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="pavatar" aria-hidden style={{ width: 56, height: 56, fontSize: 20 }}>{p.firstName.charAt(0)}{p.lastName.charAt(0)}</span>}
            <span className="grid" style={{ gap: 2, minWidth: 0 }}>
              <strong>{p.firstName} {p.lastName}</strong>
              <span className="muted">{[kind && t(kind), `${t('גיל')} ${age}`].filter(Boolean).join(' · ')}</span>
              {club && <span className="muted">{club}</span>}
            </span>
          </Link>
        );
      })}</div></>}
      {clubs.length > 0 && <><h2>{t('מועדונים')}</h2><div className="grid cols">{clubs.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="card grid" style={{ gap: 4 }}><strong>{c.name}</strong><span className="muted">{c.city ?? ''}</span></Link>)}</div></>}
    </Shell>
  );
}
