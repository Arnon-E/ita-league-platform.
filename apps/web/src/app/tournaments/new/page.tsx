import { Shell, Flash } from '@/components/Shell';
import { createTournamentAction } from '@/app/actions';
import { FORMAT, LEVEL, POINTS_TABLE_LABEL } from '@/components/labels';
import { db } from '@/db';
import { requireActor } from '@/lib/session';
import { can } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { latestRuleSet, hydrate, serialize } from '@/services/rules';
import { tr } from '@/lib/i18n';

export default async function NewTournament({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const t = await tr();
  const { err } = await searchParams;
  const actor = await requireActor();
  if (!can(actor, 'tournament.create')) redirect('/');
  const cur = await latestRuleSet(db);
  const tables = Object.keys(hydrate(cur.key, cur.version, cur.data as ReturnType<typeof serialize>).pointsTables ?? {});
  return (
    <Shell nav="home">
      <h1>{t('תחרות חדשה')}</h1>
      <Flash err={err} />
      <form action={createTournamentAction} className="card grid" style={{ maxWidth: 520 }}>
        <label>{t('שם התחרות')}<input name="name" required /></label>
        <div className="row"><label>{t('התחלה')}<input name="start" type="date" required /></label><label>{t('סיום')}<input name="end" type="date" required /></label></div>
        <label>{t('רמת התחרות')}<select name="level">{Object.entries(LEVEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
        <label>{t('סוג התחרות')}<select name="section"><option value="YOUTH">{t('נוער')}</option><option value="ADULTS">{t('בוגרים (מגיל 13 בנות, 14 בנים)')}</option><option value="MASTERS">{t('מאסטרס / סניורים (מגיל 18)')}</option><option value="OTHER">{t('אחר')}</option></select></label>
        <label>{t('פורמט')}<select name="format">{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
        <label>{t('טבלת ניקוד')}<select name="points"><option value="DEFAULT">{t('ברירת מחדל')}</option>{tables.map((k) => <option key={k} value={k}>{t(POINTS_TABLE_LABEL[k] ?? k)}</option>)}</select></label>
        <label>{t('דמי השתתפות (₪)')}<input name="fee" type="number" min="0" step="1" defaultValue="0" /></label>
        <button className="btn">{t('יצירה')}</button>
      </form>
    </Shell>
  );
}
