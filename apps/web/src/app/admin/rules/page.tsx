import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { assertCan } from '@/lib/permissions';
import { latestRuleSet, serialize, hydrate } from '@/services/rules';
import { publishRulesAction } from '@/app/actions3';

export default async function Rules({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const a = await requireActor();
  let denied = false;
  try { assertCan(a, 'ruleset.manage'); } catch { denied = true; }
  const cur = await latestRuleSet(db);
  const rs = hydrate(cur.key, cur.version, cur.data as ReturnType<typeof serialize>);
  return (
    <Shell nav="rules">
      <h1>ערכת חוקים</h1>
      <p className="muted">גרסה {cur.version} · <span className={`pill ${rs.verified ? 'ok' : 'warn'}`}>{rs.verified ? 'אומתה מול התקנון' : 'לא אומתה מול התקנון'}</span></p>
      <Flash err={denied ? 'אין הרשאה' : err} ok={ok} />
      {!denied && (
        <form action={publishRulesAction} className="card grid">
          <label>שם הגרסה<input name="name" defaultValue={cur.name} /></label>
          <label>הגדרות (JSON): טבלאות זריעה, שוברי שוויון, החזרים, נקודות. סמנו verified=true רק אחרי בדיקה מול המסמכים
            <textarea name="json" rows={24} dir="ltr" style={{ font: '13px monospace', borderRadius: 10, border: '1px solid #BCC8D6', padding: 10 }} defaultValue={JSON.stringify(serialize(rs), null, 2)} /></label>
          <button className="btn">פרסום גרסה חדשה</button>
        </form>
      )}
    </Shell>
  );
}
