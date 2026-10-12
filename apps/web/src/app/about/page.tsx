import { inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Union = { description?: string; about?: string; regulation?: string; statement?: string };
type Ev = { title: string; place: string; start: string; end: string; description: string; url: string };
type Form = { id: number; name: string; description: string; url: string };
type Sponsor = { id: number; url: string };

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** About the federation, its events, registration forms and sponsors (mirrored from the Loglig app). */
export default async function About() {
  const t = await tr();
  const rows = await db.select().from(schema.siteInfo).where(inArray(schema.siteInfo.key, ['union', 'events', 'forms', 'sponsors']));
  const get = <T,>(k: string, d: T) => (rows.find((r) => r.key === k)?.data as T | undefined) ?? d;
  const union = get<Union>('union', {});
  const events = get<Ev[]>('events', []);
  const forms = get<Form[]>('forms', []);
  const sponsors = get<Sponsor[]>('sponsors', []);
  const pre = { whiteSpace: 'pre-line' as const, lineHeight: 1.7 };
  return (
    <Shell nav="about">
      <h1>{t('אודות האיגוד')}</h1>
      {union.description && <div className="card" style={pre}>{union.description}</div>}
      {union.about && <div className="card" style={{ ...pre, marginTop: 12 }}>{union.about}</div>}
      {union.regulation && <><h2>{t('תקנון')}</h2><div className="card" style={pre}>{union.regulation}</div></>}
      {union.statement && <><h2>{t('הצהרת שחקן')}</h2><div className="card" style={pre}>{union.statement}</div></>}
      {!!forms.length && (
        <>
          <h2>{t('טפסי הרשמה')}</h2>
          <div className="grid cols">
            {forms.map((f) => (
              <a key={f.id} className="card grid" style={{ gap: 4 }} href={f.url} target="_blank" rel="noopener noreferrer">
                <strong>{f.name}</strong><span className="muted">{f.description}</span>
              </a>
            ))}
          </div>
        </>
      )}
      {!!events.length && (
        <>
          <h2>{t('אירועים')}</h2>
          <div className="grid cols">
            {events.map((e, i) => (
              <div key={i} className="card grid" style={{ gap: 4 }}>
                <strong>{e.title}</strong>
                {e.start && <span className="muted">{new Date(e.start).toLocaleDateString('he-IL')}{e.end ? ` – ${new Date(e.end).toLocaleDateString('he-IL')}` : ''}</span>}
                {e.place && <span className="muted">{e.place}</span>}
                {e.description && <span>{e.description}</span>}
                {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">{t('לפרטים')}</a>}
              </div>
            ))}
          </div>
        </>
      )}
      {!!sponsors.length && (
        <>
          <h2>{t('נותני חסות')}</h2>
          <div className="row">
            {sponsors.filter((s) => s.url).map((s) => <a key={s.id} className="pill" href={s.url} target="_blank" rel="noopener noreferrer">{host(s.url)}</a>)}
          </div>
        </>
      )}
      {!rows.length && <div className="card muted">{t('אין עדיין מידע.')}</div>}
    </Shell>
  );
}
