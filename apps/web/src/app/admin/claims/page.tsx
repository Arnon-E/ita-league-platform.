import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { listClaims, searchPlayersForLink } from '@/services/claims';
import { linkPlayerAction, resolveClaimAction, unlinkPlayerAction } from '@/app/actions9';
import { tr } from '@/lib/i18n';

const d = (x: Date) => x.toISOString().slice(0, 10);

export default async function Claims({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; q?: string }> }) {
  const t = await tr();
  const { err, ok, q = '' } = await searchParams;
  const a = await requireActor();
  let pending: Awaited<ReturnType<typeof listClaims>> = [];
  let found: Awaited<ReturnType<typeof searchPlayersForLink>> = [];
  let denied = false;
  try { pending = await listClaims(db, a); found = await searchPlayersForLink(db, a, q); } catch { denied = true; }
  return (
    <Shell nav="claims">
      <h1>{t('שיוך שחקנים לחשבונות')}</h1>
      <Flash err={denied ? t('אין הרשאה') : err} ok={ok} />
      <h2>{t('בקשות ממתינות')} ({pending.length})</h2>
      <div className="card grid">
        {pending.length === 0 && <span className="muted">{t('אין בקשות ממתינות.')}</span>}
        {pending.map(({ c, u, p }) => (
          <div key={c.id} className="grid" style={{ gap: 6, borderBottom: '1px solid var(--line, #ddd)', paddingBottom: 10 }}>
            <div><strong>{u.name}</strong> <span className="muted">{u.email}</span> {t('מבקש/ת לשייך:')} <strong>{c.firstName} {c.lastName}</strong>, {t('נולד/ה')} {d(c.birthDate)} {c.forChild && <span className="pill">{t('ילד/ה')}</span>}</div>
            {c.reason && <div className="muted">{t('הערה')}: {c.reason}</div>}
            <div>{p
              ? <>{t('שחקן מועמד:')} <a href={`/players/${p.id}`}>{p.firstName} {p.lastName}</a>, {t('נולד/ה')} {d(p.birthDate)}{p.accountId && <span className="pill bad"> {t('כבר משויך לחשבון')}</span>}{p.birthDate && d(p.birthDate) !== d(c.birthDate) && <span className="pill warn"> {t('תאריך לידה שונה')}</span>}</>
              : <span className="muted">{t('לא נמצא שחקן מתאים אוטומטית. חפשו את השחקן בשיוך ידני למטה ובחרו בו את הבקשה הזו.')}</span>}</div>
            <form action={resolveClaimAction} className="row">
              <input type="hidden" name="claim" value={c.id} />
              {p && <input type="hidden" name="player" value={p.id} />}
              <input name="note" placeholder={t('סיבת דחייה / הערה')} />
              {p && <button className="btn small" name="op" value="approve">{t('אישור ושיוך')}</button>}
              <button className="btn small ghost" name="op" value="reject">{t('דחייה')}</button>
            </form>
          </div>
        ))}
      </div>
      <h2>{t('שיוך ידני')}</h2>
      <form className="card row" method="get"><label>{t('חיפוש שחקן')}<input name="q" defaultValue={q} placeholder={t('שם פרטי או משפחה')} /></label><button className="btn small">{t('חיפוש')}</button></form>
      {found.length > 0 && (
        <div className="card" style={{ overflow: 'auto' }}>
          <table><thead><tr><th>{t('שחקן')}</th><th>{t('לידה')}</th><th>{t('חשבון משויך')}</th><th>{t('שיוך לחשבון (אימייל)')}</th></tr></thead><tbody>
            {found.map(({ p, acc, guardians }) => (
              <tr key={p.id}>
                <td><a href={`/players/${p.id}`}>{p.firstName} {p.lastName}</a></td>
                <td>{d(p.birthDate)}</td>
                <td>
                  {acc?.id ? <form action={unlinkPlayerAction} className="row"><input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} />{acc.email}<button className="btn small ghost">{t('ביטול שיוך')}</button></form> : <span className="muted">{t('אין')}</span>}
                  {guardians.map((g) => <form key={g.userId} action={unlinkPlayerAction} className="row"><input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} /><input type="hidden" name="user" value={g.userId} />{t('הורה')}: {g.email}<button className="btn small ghost">{t('הסרה')}</button></form>)}
                </td>
                <td><form action={linkPlayerAction} className="row">
                  <input type="hidden" name="q" value={q} /><input type="hidden" name="player" value={p.id} />
                  {pending.length > 0 && <select name="claim"><option value="">{t('ללא בקשה (לפי אימייל)')}</option>{pending.map(({ c, u }) => <option key={c.id} value={c.id}>{t('בקשה')}: {u.name} ({c.firstName} {c.lastName})</option>)}</select>}
                  <input name="email" type="email" placeholder={t('אימייל המשתמש (אם לא נבחרה בקשה)')} />
                  <select name="mode"><option value="self">{t('השחקן עצמו')}</option><option value="guardian">{t('הורה/אפוטרופוס')}</option></select>
                  <button className="btn small">{t('שיוך')}</button></form></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </Shell>
  );
}
