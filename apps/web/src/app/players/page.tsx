import Link from 'next/link';
import { AutoSelect } from '@/components/AutoSelect';
import { ClubSearch } from '@/components/ClubSearch';
import { GetForm } from '@/components/GetForm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { photoUrl } from '@/lib/photos';
import { GENDER } from '@/components/labels';
import { getActor } from '@/lib/session';
import { myPlayersForRelevance } from '@/services/home';
import { listClubs, searchPlayers, sectionOfBirthYear, type PlayerSection } from '@/services/public';
import { playerRanks } from '@/services/ranking-sql';
import { PlayersRows } from '@/components/InfiniteRows';

const PAGE = 60;

export default async function Players({ searchParams }: { searchParams: Promise<{ q?: string; club?: string; g?: string; age?: string; show?: string; sec?: string }> }) {
  const t = await tr();
  const { q = '', club = '', g = '', age = '', show = '', sec = '' } = await searchParams;
  const activeOnly = show !== 'all';
  const gender = g === 'MALE' || g === 'FEMALE' ? g : undefined;
  // The section (youth / adults / masters): what was chosen; searching by name or club looks at everyone; otherwise the signed-in player's own section, else youth.
  const mine = sec || q.trim() || club ? [] : await myPlayersForRelevance(db, await getActor()).catch(() => []);
  const section: PlayerSection | undefined = sec === 'YOUTH' || sec === 'ADULTS' || sec === 'MASTERS' ? sec : sec === 'ALL' || q.trim() || club ? undefined
    : mine.length ? sectionOfBirthYear(Math.max(...mine.map((p) => p.birthDate.getUTCFullYear()))) : 'YOUTH';
  const secKey = section ?? 'ALL';
  const ageN = (!section || section === 'YOUTH') && [10, 12, 14, 16, 18].includes(Number(age)) ? Number(age) : undefined;
  const [rows, clubs] = await Promise.all([
    searchPlayers(db, q, club || undefined, PAGE, { ...(gender ? { gender } : {}), ...(ageN ? { age: ageN } : {}), ...(section ? { section } : {}), activeOnly }), listClubs(db),
  ]);
  const rk = await playerRanks(db, rows.map((x) => x.p.id));
  // the same filters the page used, passed on to the endpoint that serves the following pages
  const query = new URLSearchParams({ q, club, g: gender ?? '', age: ageN ? String(ageN) : '', show: activeOnly ? '' : 'all', sec: secKey }).toString();
  const href = (s: string) => `/players?${new URLSearchParams({ q, club, g: gender ?? '', age: ageN ? String(ageN) : '', show: s, sec: secKey }).toString()}`;
  const secHref = (k: string) => `/players?${new URLSearchParams({ q, club, g: gender ?? '', age: '', show, sec: k }).toString()}`;
  return (
    <Shell nav="players">
      <h1>{t('שחקנים')}</h1>
      <nav className="tabs" style={{ margin: '0 0 12px' }} aria-label={t('מקטע')}>
        {([['YOUTH', 'נוער'], ['ADULTS', 'בוגרים'], ['MASTERS', 'מאסטרס'], ['ALL', 'הכול']] as const).map(([k, label]) => <Link key={k} scroll={false} href={secHref(k)} className={secKey === k ? 'on' : ''}>{t(label)}</Link>)}
      </nav>
      <GetForm className="pfilters">
        <input type="hidden" name="show" value={show} />
        <input type="hidden" name="sec" value={secKey} />
        <div className="psearch">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input name="q" defaultValue={q} placeholder={t('חיפוש לפי שם')} aria-label={t('חיפוש לפי שם')} enterKeyHint="search" />
          <button className="btn small">{t('חיפוש')}</button>
        </div>
        <div className="pselects">
          <AutoSelect name="g" defaultValue={g} aria-label={t('בנים ובנות')}><option value="">{t('בנים ובנות')}</option><option value="MALE">{t('בנים')}</option><option value="FEMALE">{t('בנות')}</option></AutoSelect>
          {(!section || section === 'YOUTH') && <AutoSelect name="age" defaultValue={age} aria-label={t('כל הגילאים')}><option value="">{t('כל הגילאים')}</option>{[10, 12, 14, 16, 18].map((a) => <option key={a} value={a}>{t('עד גיל')} {a}</option>)}</AutoSelect>}
          <ClubSearch name="club" defaultValue={club} clubs={clubs.map(({ c }) => ({ id: c.id, name: t(c.name) }))} l={{ all: t('כל המועדונים'), placeholder: t('חיפוש מועדון'), none: t('לא נמצא מועדון'), clear: t('ניקוי') }} />
        </div>
      </GetForm>
      <div className="pstatus">
        <nav className="tabs" style={{ margin: 0 }}>
          <Link scroll={false} href={href('')} className={activeOnly ? 'on' : ''}>{t('שחקנים פעילים')}</Link>
          <Link scroll={false} href={href('all')} className={!activeOnly ? 'on' : ''}>{t('כל השחקנים')}</Link>
        </nav>
        <p className="muted">{activeOnly ? t('מוצגים שחקנים פעילים בלבד (תחרו ב-18 החודשים האחרונים). לכולם בחרו "כל השחקנים".') : t('מוצגים כל השחקנים, כולל לא פעילים.')}</p>
      </div>
      <PlayersRows
        key={query}
        initial={rows.map(({ p, club: cn }) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, club: cn, gender: p.gender, birthYear: p.birthDate.getUTCFullYear(), rank: rk.get(p.id)?.rank ?? null, photo: photoUrl(p.photo) }))}
        query={query} pageSize={PAGE}
        genders={Object.fromEntries(Object.entries(GENDER).map(([k, v]) => [k, t(v)]))}
        labels={{ player: t('שחקן'), club: t('מועדון'), gender: t('מין'), birth: t('שנת לידה'), rank: t('דירוג'), age: t('גיל'), loading: t('טוען...'), retry: t('נסו שוב'), end: '', none: t('לא נמצאו שחקנים.') }}
      />
    </Shell>
  );
}
