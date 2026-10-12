import { db } from '@/db';
import { Shell } from '@/components/Shell';
import Link from 'next/link';
import { tr } from '@/lib/i18n';
import { AGE_GROUPS, listClubs, rankingTable } from '@/services/public';
import { RankingRows } from '@/components/InfiniteRows';

const PAGE = 60;

export default async function Rankings({ searchParams }: { searchParams: Promise<{ g?: string; age?: string; club?: string }> }) {
  const t = await tr();
  const { g = 'MALE', age = '', club = '' } = await searchParams;
  const gender = (g === 'FEMALE' ? 'FEMALE' : 'MALE') as 'MALE' | 'FEMALE';
  const ageN = (AGE_GROUPS as readonly number[]).includes(Number(age)) ? Number(age) : undefined;
  const [all, clubs] = await Promise.all([rankingTable(db, { gender, ...(ageN ? { age: ageN } : {}), ...(club ? { clubId: club } : {}) }), listClubs(db)]);
  const href = (o: { g?: string; age?: string }) => `/rankings?g=${o.g ?? gender}&age=${o.age ?? age}&club=${club}`;
  // following pages come from the public rankings endpoint with the same filters
  const query = new URLSearchParams({ g: gender, age: ageN ? String(ageN) : '', club }).toString();
  return (
    <Shell nav="rank">
      <h1>{t('דירוג')}</h1>
      <p className="muted">{t('52 שבועות אחרונים · 6 תוצאות יחיד הטובות ביותר')} · {all.length} {t('שחקנים')}</p>
      <nav className="tabs">{[['MALE', 'בנים/גברים'], ['FEMALE', 'בנות/נשים']].map(([k, l]) => <a key={k} href={href({ g: k })} className={gender === k ? 'on' : ''}>{t(l ?? '')}</a>)}</nav>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link href={href({ age: '' })} className={`pill ${!ageN ? 'lime' : ''}`}>{t('כללי')}</Link>
        {AGE_GROUPS.map((a) => <Link key={a} href={href({ age: String(a) })} className={`pill ${ageN === a ? 'lime' : ''}`}>{t('עד גיל')} {a}</Link>)}
        <form className="row" style={{ marginInlineStart: 'auto' }}>
          <input type="hidden" name="g" value={gender} /><input type="hidden" name="age" value={age} />
          <select name="club" defaultValue={club}><option value="">{t('כל המועדונים')}</option>{clubs.map(({ c }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn small ghost">{t('סינון')}</button>
        </form>
      </div>
      <RankingRows
        key={query}
        initial={all.slice(0, PAGE)} query={query} pageSize={PAGE}
        labels={{ player: t('שחקן'), club: t('מועדון'), points: t('נקודות'), counted: t('תוצאות נספרות'), loading: t('טוען...'), retry: t('נסו שוב'), end: '', none: t('אין עדיין נתוני דירוג.') }}
      />
    </Shell>
  );
}
