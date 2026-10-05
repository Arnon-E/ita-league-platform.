import { db } from '@/db';
import { Shell } from '@/components/Shell';
import Link from 'next/link';
import { tr } from '@/lib/i18n';
import { AGE_GROUPS, listClubs, rankingTable } from '@/services/public';

export default async function Rankings({ searchParams }: { searchParams: Promise<{ g?: string; age?: string; club?: string }> }) {
  const t = await tr();
  const { g = 'MALE', age = '', club = '' } = await searchParams;
  const gender = (g === 'FEMALE' ? 'FEMALE' : 'MALE') as 'MALE' | 'FEMALE';
  const ageN = (AGE_GROUPS as readonly number[]).includes(Number(age)) ? Number(age) : undefined;
  const [rows, clubs] = await Promise.all([rankingTable(db, { gender, ...(ageN ? { age: ageN } : {}), ...(club ? { clubId: club } : {}) }), listClubs(db)]);
  const href = (o: { g?: string; age?: string; club?: string }) => `/rankings?g=${o.g ?? gender}&age=${o.age ?? age}&club=${o.club ?? club}`;
  return (
    <Shell nav="rank">
      <h1>{t('דירוג')}</h1>
      <p className="muted">{t('52 שבועות אחרונים · 6 תוצאות יחיד הטובות ביותר')}</p>
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
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>#</th><th>{t('שחקן')}</th><th>{t('מועדון')}</th><th>{t('נקודות')}</th><th>{t('תוצאות נספרות')}</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.playerId}><td>{r.rank}</td><td><Link href={`/players/${r.playerId}`}>{r.name}</Link></td><td>{r.club ?? '—'}</td><td><strong>{r.points}</strong></td><td>{r.counted}</td></tr>)}
        </tbody></table>
        {!rows.length && <p className="muted">{t('אין עדיין נתוני דירוג.')}</p>}
      </div>
    </Shell>
  );
}
