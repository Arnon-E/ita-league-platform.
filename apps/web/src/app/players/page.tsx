import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { GENDER } from '@/components/labels';
import { listClubs, searchPlayers } from '@/services/public';
import { PlayersRows } from '@/components/InfiniteRows';

const PAGE = 60;

export default async function Players({ searchParams }: { searchParams: Promise<{ q?: string; club?: string; g?: string; age?: string }> }) {
  const t = await tr();
  const { q = '', club = '', g = '', age = '' } = await searchParams;
  const gender = g === 'MALE' || g === 'FEMALE' ? g : undefined;
  const ageN = [10, 12, 14, 16, 18].includes(Number(age)) ? Number(age) : undefined;
  const [rows, clubs] = await Promise.all([
    searchPlayers(db, q, club || undefined, PAGE, { ...(gender ? { gender } : {}), ...(ageN ? { age: ageN } : {}) }), listClubs(db),
  ]);
  // the same filters the page used, passed on to the endpoint that serves the following pages
  const query = new URLSearchParams({ q, club, g: gender ?? '', age: ageN ? String(ageN) : '' }).toString();
  return (
    <Shell nav="players">
      <h1>{t('שחקנים')}</h1>
      <form className="card row" style={{ margin: '12px 0' }}>
        <input name="q" defaultValue={q} placeholder={t('חיפוש לפי שם')} style={{ flex: 1, minWidth: 180 }} />
        <select name="g" defaultValue={g}><option value="">{t('בנים ובנות')}</option><option value="MALE">{t('בנים')}</option><option value="FEMALE">{t('בנות')}</option></select>
        <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{[10, 12, 14, 16, 18].map((a) => <option key={a} value={a}>{t('עד גיל')} {a}</option>)}</select>
        <select name="club" defaultValue={club}><option value="">{t('כל המועדונים')}</option>{clubs.map(({ c }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn">{t('חיפוש')}</button>
      </form>
      <PlayersRows
        key={query}
        initial={rows.map(({ p, club: cn }) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, club: cn, gender: p.gender, birthYear: p.birthDate.getUTCFullYear() }))}
        query={query} pageSize={PAGE}
        genders={Object.fromEntries(Object.entries(GENDER).map(([k, v]) => [k, t(v)]))}
        labels={{ player: t('שחקן'), club: t('מועדון'), gender: t('מין'), birth: t('שנת לידה'), loading: t('טוען...'), retry: t('נסו שוב'), end: '', none: t('לא נמצאו שחקנים.') }}
      />
    </Shell>
  );
}
