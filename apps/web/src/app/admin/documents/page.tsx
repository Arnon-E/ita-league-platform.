import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { pendingDocuments } from '@/services/documents';
import { signedUrl } from '@/lib/storage';
import { reviewDocAction } from '@/app/actions2';
import { tr } from '@/lib/i18n';

const DOC: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };

export default async function Docs({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const t = await tr();
  const { err, ok } = await searchParams;
  const a = await requireActor();
  let rows: Awaited<ReturnType<typeof pendingDocuments>> = [];
  let denied = false;
  try { rows = await pendingDocuments(db, a); } catch { denied = true; }
  return (
    <Shell nav="docs">
      <h1>{t('אישור מסמכים')}</h1>
      <Flash err={denied ? t('אין הרשאה') : err} ok={ok} />
      <div className="grid">
        {rows.map(({ d, p }) => (
          <form key={d.id} action={reviewDocAction} className="card row">
            <input type="hidden" name="doc" value={d.id} />
            <strong>{p.firstName} {p.lastName}</strong><span>{t(DOC[d.type] ?? d.type)}</span>
            <a className="btn small ghost" href={signedUrl(d.storageKey)} target="_blank">{t('צפייה')}</a>
            <input name="note" placeholder={t('הערה (חובה בדחייה)')} style={{ flex: 1 }} />
            <button className="btn small" name="decision" value="APPROVED">{t('אישור')}</button>
            <button className="btn small ghost" name="decision" value="REJECTED">{t('דחייה')}</button>
          </form>
        ))}
        {!rows.length && !denied && <div className="card muted">{t('אין מסמכים ממתינים.')}</div>}
      </div>
    </Shell>
  );
}
