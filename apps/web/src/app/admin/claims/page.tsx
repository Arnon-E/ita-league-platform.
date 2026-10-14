import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { listClaims, searchPlayersForLink } from '@/services/claims';
import { linkPlayerAction, resolveClaimAction, unlinkPlayerAction } from '@/app/actions9';

const d = (x: Date) => x.toISOString().slice(0, 10);

export default async function Claims({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; q?: string }> }) {
  const { err, ok, q = '' } = await searchParams;
  const a = await requireActor();
  let pending: Awaited<ReturnType<typeof listClaims>> = [];
  let found: Awaited<ReturnType<typeof searchPlayersForLink>> = [];
  let denied = false;
  try { pending = await listClaims(db, a); found = await searchPlayersForLink(db, a, q); } catch { denied = true; }
  return (
    <Shell nav="claims">
      <h1>שיוך שחקנים לחשבונות</h1>
      <Flash err={denied ? 'אין הרשאה' : err} ok={ok} />
      <h2>בקשות ממתינות ({pending.length})</h2>
      <div className="card grid">
        {pending.length === 0 && <span className="muted">אין בקשות ממתינות.</span>}
        {pending.map(({ c, u, p }) => (
          <div key={c.id} className="grid" style={{ gap: 6, borderBottom: '1px solid var(--line, #ddd)', paddingBottom: 10 }}>
            <div><strong>{u.name}</strong> <span className="muted">{u.email}</span> מבקש/ת לשייך: <strong>{c.firstName} {c.lastName}</strong>, נולד/ה {d(c.birthDate)} {c.forChild && <span className="pill">ילד/ה</span>}</div>
            {c.reason && <div className="muted">הערה: {c.reason}</div>}
            <div>{p
              ? <>שחקן מועמד: <a href={`/players/${p.id}`}>{p.firstName} {p.lastName}</a>, נולד/ה {d(p.birthDate)}{p.accountId && <span className="pill bad"> כבר משויך לחשבון</span>}{p.birthDate && d(p.birthDate) !== d(c.birthDate) && <span className="pill warn"> תאריך לידה שונה</span>}</>
              : <span className="muted">לא נמצא שחקן מתאים אוטומטית. חפשו בחיפוש למטה ושייכו ידנית.</span>}</div>
            <form action={resolveClaimAction} className="row">
              <input type="hidden" name="claim" value={c.id} />
              {p && <input type="hidden" name="player" value={p.id} />}
              <input name="note" placeholder="סיבת דחייה / הערה" />
              {p && <button className="btn small" name="op" value="approve">אישור ושיוך</button>}
              <button className="btn small ghost" name="op" value="reject">דחייה</button>
            </form>
          </div>
        ))}
      </div>
      <h2>שיוך ידני</h2>
      <form className="card row" method="get"><label>חיפוש שחקן<input name="q" defaultValue={q} placeholder="שם פרטי או משפחה" /></label><button className="btn small">חיפוש</button></form>
      {found.length > 0 && (
        <div className="card" style={{ overflow: 'auto' }}>
          <table><thead><tr><th>שחקן</th><th>לידה</th><th>חשבון משויך</th><th>שיוך לחשבון (אימייל)</th></tr></thead><tbody>
            {found.map(({ p, acc, guardians }) => (
              <tr key={p.id}>
                <td><a href={`/players/${p.id}`}>{p.firstName} {p.lastName}</a></td>
                <td>{d(p.birthDate)}</td>
                <td>
                  {acc?.id ? <form action={unlinkPlayerAction} className="row"><input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} />{acc.email}<button className="btn small ghost">ביטול שיוך</button></form> : <span className="muted">אין</span>}
                  {guardians.map((g) => <form key={g.userId} action={unlinkPlayerAction} className="row"><input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} /><input type="hidden" name="user" value={g.userId} />הורה: {g.email}<button className="btn small ghost">הסרה</button></form>)}
                </td>
                <td><form action={linkPlayerAction} className="row">
                  <input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} />
                  <input name="email" type="email" placeholder="אימייל המשתמש" required />
                  <select name="mode"><option value="self">השחקן עצמו</option><option value="guardian">הורה/אפוטרופוס</option></select>
                  <button className="btn small">שיוך</button></form></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </Shell>
  );
}
