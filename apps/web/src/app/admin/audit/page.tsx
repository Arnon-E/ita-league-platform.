import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { recentAudit } from '@/services/users';

export default async function Audit() {
  const a = await requireActor();
  let rows: Awaited<ReturnType<typeof recentAudit>> = [];
  let denied = false;
  try { rows = await recentAudit(db, a); } catch { denied = true; }
  return (
    <Shell nav="audit">
      <h1>יומן ביקורת</h1>
      {denied && <div className="err">אין הרשאה</div>}
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>זמן</th><th>פעולה</th><th>ישות</th><th>משתמש</th><th>פרטים</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td>{r.createdAt.toLocaleString('he-IL')}</td><td>{r.action}{r.impersonatedBy && <span className="pill warn">התחזות</span>}</td><td>{r.entity}</td><td className="muted">{r.userId?.slice(0, 8)}</td><td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(r.detail)}</td></tr>)}
        </tbody></table>
      </div>
    </Shell>
  );
}
