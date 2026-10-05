import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { rankingFor } from '@/services/rankings';
import { inArray } from 'drizzle-orm';
import Link from 'next/link';

export default async function Rankings({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { g = 'MALE' } = await searchParams;
  const gender = (['MALE', 'FEMALE', 'OPEN'].includes(g) ? g : 'MALE') as 'MALE';
  const rs = await ensureDefaultRuleSet(db);
  const rows = await rankingFor(db, gender, new Date(), await loadRuleSet(db, rs.id));
  const ps = rows.length ? await db.select().from(schema.players).where(inArray(schema.players.id, rows.map((r) => r.playerId))) : [];
  const nm = new Map(ps.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  return (
    <Shell nav="rank">
      <h1>דירוג</h1>
      <p className="muted">52 שבועות אחרונים · 6 תוצאות יחיד הטובות ביותר</p>
      <nav className="tabs">{[['MALE', 'בנים/גברים'], ['FEMALE', 'בנות/נשים']].map(([k, l]) => <a key={k} href={`/rankings?g=${k}`} className={gender === k ? 'on' : ''}>{l}</a>)}</nav>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>#</th><th>שחקן</th><th>נקודות</th><th>תוצאות נספרות</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.playerId}><td>{r.rank}</td><td><Link href={`/players/${r.playerId}`}>{nm.get(r.playerId)}</Link></td><td><strong>{r.points}</strong></td><td>{r.counted.length}</td></tr>)}
        </tbody></table>
        {!rows.length && <p className="muted">אין עדיין נתוני דירוג.</p>}
      </div>
    </Shell>
  );
}
