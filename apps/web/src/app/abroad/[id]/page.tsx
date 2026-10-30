import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { Flag } from '@/components/Flag';
import { fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { countryInfo } from '@/lib/countries';
import { abroadEvent, phaseOf } from '@/services/abroad';

export const dynamic = 'force-dynamic';

const TZ = 'Asia/Jerusalem';
/** A nation's flag as Tennis Europe's own site shows it (its three-letter code is the file name), so no table of codes is needed. */
const flagUrl = (cc: string) => `https://static.tournamentsoftware.com/content/images/flags/${cc}.svg`;

/** Public to everyone: a Tennis Europe tournament abroad that is on or just ended, with the matches and results of the Israeli players in it. */
export default async function AbroadEventPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await tr();
  const { id } = await params;
  const e = await abroadEvent(db, id);
  if (!e) notFound();
  const phase = phaseOf({ start: e.startDate, end: e.endDate });
  const matches = e.results?.matches ?? [];
  const days = [...new Set(matches.map((m) => m.day))].sort().reverse(); // the latest day first
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric' });
  const range = `${e.startDate.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' })} – ${e.endDate.toLocaleDateString('he-IL', { timeZone: TZ })}`;
  const where = [e.city, t(countryInfo(e.country).he)].filter(Boolean).join(', ');

  const Side = ({ s }: { s: { names: string[]; cc: string[]; won: boolean; msg: string } }) => (
    <span className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'baseline', fontWeight: s.won ? 800 : 500, ...(s.cc.includes('ISR') ? { color: 'var(--blue)' } : {}) }}>
      <span style={{ display: 'inline-flex', gap: 3, flex: 'none' }}>{s.cc.map((c, i) => <img key={i} src={flagUrl(c)} width={20} height={15} alt={c} style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)' }} />)}</span>
      <span dir="ltr" style={{ textAlign: 'start' }}>{s.names.join(' / ')}</span>
      {s.msg && <span className="muted" style={{ fontWeight: 400 }}>{s.msg}</span>}
    </span>
  );

  return (
    <Shell nav="abroad">
      <p style={{ margin: 0 }}><Link href="/abroad" className="muted"><u>{t('חזרה לתחרויות חו"ל')}</u></Link></p>
      <h1 style={{ marginBottom: 4 }}>{e.name}</h1>
      <p className="muted" style={{ margin: 0 }}><Flag country={e.country} /> {where} · {range}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <span className={`pill ${phase === 'live' ? 'lime' : ''}`}>{phase === 'live' ? t('מתקיימת עכשיו') : phase === 'done' ? t('הסתיימה') : t('בקרוב')}</span>
        {e.ageGroup && <span className="pill">U{e.ageGroup}</span>}
        {e.category && <span className="pill">{e.category}</span>}
        <a className="btn ghost" href={e.url} target="_blank" rel="noopener noreferrer">{t('כל המשחקים והתוצאות ב-Tennis Europe')}</a>
      </div>
      <h2>{t('משחקים של שחקנים ישראלים')}</h2>
      {e.results?.updated && <p className="muted" style={{ margin: 0 }}>{t('עודכן')} {new Date(e.results.updated).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      {days.length ? days.map((d) => (
        <section key={d}>
          <h3 style={{ margin: '16px 0 8px' }}>{dayLabel(d)}</h3>
          <div className="grid cols">
            {matches.filter((m) => m.day === d).map((m, i) => (
              <div key={`${d}-${i}`} className="card grid" style={{ gap: 8 }}>
                <span className="grid" style={{ gap: 2 }}><span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{m.draw}{m.stage ? ` · ${m.stage}` : ''}</span><span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{[m.time, m.court].filter(Boolean).join(' · ')}</span></span>
                <Side s={m.a} />
                <Side s={m.b} />
                <span className="muted" style={{ fontWeight: 600 }}>{m.sets.length ? fmtScore(m.sets.map(([a, b]) => ({ a: a ?? 0, b: b ?? 0 }))) : t('טרם שוחק')}</span>
              </div>
            ))}
          </div>
        </section>
      )) : (
        <div className="card muted">{phase === 'up' ? t('הטורניר עוד לא התחיל.') : t('עדיין אין משחקים של שחקנים ישראלים בטורניר, או שהמארגן עוד לא פירסם אותם. לכל המשחקים אפשר לעבור לדף הטורניר ב-Tennis Europe.')}</div>
      )}
      <p className="muted" style={{ marginTop: 18 }}>{t('המשחקים נלקחים מהאתר של Tennis Europe ומתעדכנים בערך פעם בשעה בזמן הטורניר.')}</p>
    </Shell>
  );
}
