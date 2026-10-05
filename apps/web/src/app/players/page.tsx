import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { GENDER } from '@/components/labels';
import { listClubs, searchPlayers } from '@/services/public';

export default async function Players({ searchParams }: { searchParams: Promise<{ q?: string; club?: string }> }) {
  const { q = '', club = '' } = await searchParams;
  const [rows, clubs] = await Promise.all([searchPlayers(db, q, club || undefined), listClubs(db)]);
  return (
    <Shell nav="players">
      <h1>שחקנים</h1>
      <form className="card row" style={{ margin: '12px 0' }}>
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם" style={{ flex: 1, minWidth: 180 }} />
        <select name="club" defaultValue={club}><option value="">כל המועדונים</option>{clubs.map(({ c }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn">חיפוש</button>
      </form>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>שחקן</th><th>מועדון</th><th>מין</th></tr></thead><tbody>
          {rows.map(({ p, club: cn }) => <tr key={p.id}><td><Link href={`/players/${p.id}`}><strong>{p.firstName} {p.lastName}</strong></Link></td><td>{cn ?? '—'}</td><td>{GENDER[p.gender]}</td></tr>)}
        </tbody></table>
        {!rows.length && <p className="muted">לא נמצאו שחקנים.</p>}
        {rows.length === 100 && <p className="muted">מוצגים 100 הראשונים. צמצמו את החיפוש.</p>}
      </div>
    </Shell>
  );
}
