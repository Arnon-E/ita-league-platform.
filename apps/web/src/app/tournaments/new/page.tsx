import { Shell, Flash } from '@/components/Shell';
import { createTournamentAction } from '@/app/actions';
import { FORMAT } from '@/components/labels';

export default async function NewTournament({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <Shell nav="home">
      <h1>תחרות חדשה</h1>
      <Flash err={err} />
      <form action={createTournamentAction} className="card grid" style={{ maxWidth: 520 }}>
        <label>שם התחרות<input name="name" required /></label>
        <div className="row"><label>התחלה<input name="start" type="date" required /></label><label>סיום<input name="end" type="date" required /></label></div>
        <label>פורמט<select name="format">{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>דמי השתתפות (₪)<input name="fee" type="number" min="0" step="1" defaultValue="0" /></label>
        <button className="btn">יצירה</button>
      </form>
    </Shell>
  );
}
