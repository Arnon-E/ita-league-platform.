import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { GENDER } from '@/components/labels';
import { listClubs, searchPlayers } from '@/services/public';

export default async function Players({ searchParams }: { searchParams: Promise<{ q?: string; club?: string; g?: string; age?: string; page?: string }> }) {
  const t = await tr();
  const { q = '', club = '', g = '', age = '', page = '1' } = await searchParams;
  const pageN = Math.max(1, Number(page) || 1);
  const gender = g === 'MALE' || g === 'FEMALE' ? g : undefined;
  const ageN = [10, 12, 14, 16, 18].includes(Number(age)) ? Number(age) : undefined;
  const [rows, clubs] = await Promise.all([
    searchPlayers(db, q, club || undefined, 100, { ...(gender ? { gender } : {}), ...(ageN ? { age: ageN } : {}), offset: (pageN - 1) * 100 }), listClubs(db),
  ]);
  const link = (n: number) => `/players?${new URLSearchParams({ q, club, g, age, page: String(n) }).toString()}`;
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
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t('שחקן')}</th><th>{t('מועדון')}</th><th>{t('מין')}</th><th>{t('שנת לידה')}</th></tr></thead><tbody>
          {rows.map(({ p, club: cn }) => <tr key={p.id}><td><Link href={`/players/${p.id}`}><strong>{p.firstName} {p.lastName}</strong></Link></td><td>{cn ?? '—'}</td><td>{t(GENDER[p.gender] ?? '')}</td><td>{p.birthDate.getUTCFullYear()}</td></tr>)}
        </tbody></table>
        {!rows.length && <p className="muted">{t('לא נמצאו שחקנים.')}</p>}
        <div className="row">
          {pageN > 1 && <Link className="btn ghost" href={link(pageN - 1)}>{t('הקודם')}</Link>}
          {rows.length === 100 && <Link className="btn ghost" href={link(pageN + 1)}>{t('הבא')}</Link>}
        </div>
      </div>
    </Shell>
  );
}
