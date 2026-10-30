import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { tr } from '@/lib/i18n';
import { listAbroadLinks } from '@/services/abroad-players';
import { resolveAbroadLinkAction } from '@/app/actions-abroad';

const d = (x: Date) => x.toISOString().slice(0, 10);

/** The federation's review of Israeli players seen at tournaments abroad: which of the players of this site is "Ben STRAUSS". */
export default async function AbroadPlayers({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const t = await tr();
  const { err, ok } = await searchParams;
  const a = await requireActor();
  let rows: Awaited<ReturnType<typeof listAbroadLinks>> = [];
  let denied = false;
  try { rows = await listAbroadLinks(db, a); } catch { denied = true; }
  const pending = rows.filter((r) => r.link.status === 'PENDING');
  const auto = rows.filter((r) => r.link.status === 'AUTO');
  return (
    <Shell nav="abroadplayers">
      <h1>{t('שיוך שחקנים מחו"ל')}</h1>
      <p className="muted">{t('שמות של שחקנים ישראלים שנראו בטורנירים בחו"ל (באותיות לועזיות), ומי מהשחקנים באתר הם. התאמה בטוחה נעשית אוטומטית; כאן מאשרים את מה שלא היה ברור.')}</p>
      <Flash err={denied ? t('אין הרשאה') : err} ok={ok} />
      <h2>{t('ממתינים לאישור')} ({pending.length})</h2>
      <div className="card grid">
        {pending.length === 0 && <span className="muted">{t('אין שמות שממתינים.')}</span>}
        {pending.map(({ link, candidates }) => (
          <div key={link.key} className="grid" style={{ gap: 6, borderBottom: '1px solid var(--line, #ddd)', paddingBottom: 10 }}>
            <strong dir="ltr" style={{ textAlign: 'start' }}>{link.name} <span className="muted">· {link.gender === 'FEMALE' ? 'F' : 'M'}</span></strong>
            {candidates.map((c) => (
              <form key={c.id} action={resolveAbroadLinkAction} className="row" style={{ justifyContent: 'space-between' }}>
                <input type="hidden" name="key" value={link.key} /><input type="hidden" name="player" value={c.id} />
                <span><a href={`/players/${c.id}`}><u>{c.first} {c.last}</u></a> <span className="muted">· {t('נולד/ה')} {d(c.birth)}</span></span>
                <button className="btn small">{t('זה השחקן')}</button>
              </form>
            ))}
            <form action={resolveAbroadLinkAction}><input type="hidden" name="key" value={link.key} /><button className="btn ghost small">{t('אף אחד מהם')}</button></form>
          </div>
        ))}
      </div>
      <h2>{t('שויכו אוטומטית')} ({auto.length})</h2>
      <div className="card grid">
        {auto.map(({ link, linked }) => (
          <form key={link.key} action={resolveAbroadLinkAction} className="row" style={{ justifyContent: 'space-between' }}>
            <input type="hidden" name="key" value={link.key} />
            <span><span dir="ltr">{link.name}</span> → {linked ? <a href={`/players/${linked.id}`}><u>{linked.first} {linked.last}</u></a> : '—'}</span>
            <button className="btn ghost small">{t('ביטול השיוך')}</button>
          </form>
        ))}
      </div>
    </Shell>
  );
}
