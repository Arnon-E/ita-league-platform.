import { Shell, Flash } from '@/components/Shell';
import { createTournamentAction } from '@/app/actions';
import { FORMAT, LEVEL } from '@/components/labels';
import { db } from '@/db';
import { requireActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { latestRuleSet, hydrate, serialize } from '@/services/rules';

export default async function NewTournament({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const actor = await requireActor();
  if (!can(actor, 'tournament.create')) redirect('/');
  const cur = await latestRuleSet(db);
  const tables = Object.keys(hydrate(cur.key, cur.version, cur.data as ReturnType<typeof serialize>).pointsTables ?? {});
  return (
    <Shell nav="home">
      <h1>תחרות חדשה</h1>
      <Flash err={err} />
      <form action={createTournamentAction} className="card grid" style={{ maxWidth: 520 }}>
        <label>שם התחרות<input name="name" required /></label>
        <div className="row"><label>התחלה<input name="start" type="date" required /></label><label>סיום<input name="end" type="date" required /></label></div>
        <label>רמת התחרות<select name="level">{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>פורמט<select name="format">{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>טבלת ניקוד<select name="points"><option value="DEFAULT">ברירת מחדל</option>{tables.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>דמי השתתפות (₪)<input name="fee" type="number" min="0" step="1" defaultValue="0" /></label>
        <button className="btn">יצירה</button>
      </form>
    </Shell>
  );
}
