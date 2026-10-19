import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { can } from '@/lib/permissions';
import { requireActor } from '@/lib/session';
import { tr } from '@/lib/i18n';

const REPORTS: [string, string, string][] = [
  ['players', 'רשימת שחקנים', 'שם, מין, שנת לידה ומועדון לכל שחקן'],
  ['entries', 'הרשמות לתחרויות', 'כל ההרשמות עם סטטוס ותשלום'],
  ['results', 'תוצאות משחקים', 'כל המשחקים עם התוצאה והמנצח'],
  ['points', 'נקודות דירוג', 'היסטוריית חלוקת הנקודות לכל שחקן'],
];

export default async function Reports() {
  const t = await tr();
  const a = await requireActor();
  if (!can(a, 'audit.read')) redirect('/');
  return (
    <Shell nav="reports">
      <h1>{t('דוחות')}</h1>
      <p className="muted">{t('ייצוא לקובץ CSV שנפתח ישירות באקסל.')}</p>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {REPORTS.map(([k, title, desc]) => (
          <a key={k} href={`/api/reports/${k}`} className="card grid" style={{ gap: 6 }}>
            <strong style={{ fontSize: 17 }}>{t(title)}</strong><span className="muted">{t(desc)}</span><span className="pill" style={{ width: 'fit-content' }}>{t('הורדת CSV')}</span>
          </a>
        ))}
      </div>
    </Shell>
  );
}
