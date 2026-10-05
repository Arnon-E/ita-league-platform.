import { Flash, Shell } from '@/components/Shell';
import { importAction } from '@/app/actions2';

export default async function Import({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  return (
    <Shell nav="import">
      <h1>ייבוא מלוגליג</h1>
      <p className="muted">קובץ CSV (UTF-8). שחקנים: loglig_id, first_name, last_name, birth_date, gender, club, id_number. נקודות: loglig_id, tournament, date, points, multiplier, kind. הייבוא כפול-בטוח: הרצה חוזרת מעדכנת ולא משכפלת.</p>
      <Flash err={err} ok={ok} />
      <form action={importAction} className="card grid" style={{ maxWidth: 640 }}>
        <label>סוג<select name="kind"><option value="players">שחקנים</option><option value="points">היסטוריית נקודות</option></select></label>
        <label>קובץ<input type="file" name="file" accept=".csv,text/csv" /></label>
        <label>או הדבקה<textarea name="csv" rows={6} style={{ font: 'inherit', borderRadius: 10, border: '1px solid #BCC8D6', padding: 10 }} /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="dry" value="1" defaultChecked style={{ minHeight: 0 }} /> בדיקה בלבד (ללא שמירה)</label>
        <button className="btn">הרצה</button>
      </form>
    </Shell>
  );
}
