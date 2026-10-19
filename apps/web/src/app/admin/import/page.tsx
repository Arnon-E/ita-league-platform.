import { Flash, Shell } from '@/components/Shell';
import { importAction } from '@/app/actions2';
import { importDbAction } from '@/app/actions3';
import { tr } from '@/lib/i18n';

export default async function Import({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const t = await tr();
  const { err, ok } = await searchParams;
  return (
    <Shell nav="import">
      <h1>{t('ייבוא מלוגליג')}</h1>
      <p className="muted">{t('קובץ CSV (UTF-8). שחקנים: loglig_id, first_name, last_name, birth_date, gender, club, id_number. נקודות: loglig_id, tournament, date, points, multiplier, kind. הייבוא כפול-בטוח: הרצה חוזרת מעדכנת ולא משכפלת.')}</p>
      <Flash err={err} ok={ok} />
      <form action={importAction} className="card grid" style={{ maxWidth: 640 }}>
        <label>{t('סוג')}<select name="kind"><option value="players">{t('שחקנים')}</option><option value="points">{t('היסטוריית נקודות')}</option></select></label>
        <label>{t('קובץ')}<input type="file" name="file" accept=".csv,text/csv" /></label>
        <label>{t('או הדבקה')}<textarea name="csv" rows={6} style={{ font: 'inherit', borderRadius: 10, border: '1px solid #BCC8D6', padding: 10 }} /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="dry" value="1" defaultChecked style={{ minHeight: 0 }} /> {t('בדיקה בלבד (ללא שמירה)')}</label>
        <button className="btn">{t('הרצה')}</button>
      </form>
      <h2>{t('ייבוא ישיר ממסד הנתונים של לוגליג')}</h2>
      <p className="muted">{t('חיבור לקריאה בלבד (postgres:// או mysql://). לכל סוג כותבים שאילתת SELECT אחת שנותנת לעמודות את השמות שלמעלה (AS). המיפוי נמצא בשאילתה כי מבנה הטבלאות של לוגליג אינו פומבי. מומלץ לעבוד מול עותק/replica.')}</p>
      <form action={importDbAction} className="card grid" style={{ maxWidth: 760 }}>
        <label>{t('כתובת חיבור')}<input name="url" type="password" dir="ltr" placeholder="mysql://readonly:***@host:3306/loglig" required autoComplete="off" /></label>
        <label>{t('שאילתת שחקנים')}<textarea name="playersSql" rows={4} dir="ltr" style={{ font: '13px monospace', borderRadius: 10, border: '1px solid #BCC8D6', padding: 10 }} placeholder="select id as loglig_id, first_name, last_name, birth_date, gender, club_name as club, national_id as id_number from players" /></label>
        <label>{t('שאילתת נקודות (אחרי השחקנים)')}<textarea name="pointsSql" rows={4} dir="ltr" style={{ font: '13px monospace', borderRadius: 10, border: '1px solid #BCC8D6', padding: 10 }} placeholder="select player_id as loglig_id, tournament_name as tournament, date, points from ranking_points" /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="dry" value="1" defaultChecked style={{ minHeight: 0 }} /> {t('בדיקה בלבד (ללא שמירה)')}</label>
        <button className="btn">{t('הרצה')}</button>
      </form>
    </Shell>
  );
}
