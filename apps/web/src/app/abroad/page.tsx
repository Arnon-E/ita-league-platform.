import Link from 'next/link';
import { GetForm } from '@/components/GetForm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { abroadCatalog, entryState, type AbroadRow } from '@/services/abroad';
import { countryInfo } from '@/lib/countries';
import { Flag } from '@/components/Flag';

export const dynamic = 'force-dynamic';

const TZ = 'Asia/Jerusalem';
const dm = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' });
const dy = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ });
const dt = (x: Date) => x.toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const monthKey = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const PAGE = 48;
/** Tennis Europe's tournament grades, with a word on what each means (the circuit's own names stay: that is what the tournament pages say). */
const CAT_HE: Record<string, string> = {
  'Super Category': 'Super Category · הדרגה הגבוהה ביותר', 'Category 1': 'Category 1 · דרגה גבוהה', 'Category 2': 'Category 2 · דרגה בינונית', 'Category 3': 'Category 3 · דרגת כניסה',
  'Tennis Europe Festival': 'Festival · פסטיבל',
};

type Q = { circuit?: string; age?: string; country?: string; month?: string; cat?: string; open?: string; n?: string };

/** Public to everyone: junior tournaments outside Israel (Tennis Europe, mirrored by the daily sync): when and where, the level, until when to enter, the fee. */
export default async function Abroad({ searchParams }: { searchParams: Promise<Q> }) {
  const t = await tr();
  const q = await searchParams;
  const { circuit = '', age = '', country = '', month = '', cat = '', open = '' } = q;
  const limit = Math.max(PAGE, Number(q.n) || PAGE);
  const now = new Date();
  const year = now.getFullYear();
  // events closed to other nations are not for our players to enter
  const all = (await abroadCatalog(db)).filter((e) => !e.closed);
  const inCircuit = circuit ? all.filter((e) => e.circuit === circuit) : all;
  const rows = inCircuit.filter((e) => (!age || String(e.age) === age) && (!country || e.country === country) && (!month || monthKey(e.start) === month) && (!cat || e.category === cat)
    && (!open || ['open', 'soon'].includes(entryState(e, now))));
  const openCount = inCircuit.filter((e) => ['open', 'soon'].includes(entryState(e, now))).length;
  const opts = (f: (e: AbroadRow) => string | null) => [...new Set(inCircuit.map(f).filter((x): x is string => !!x))].sort();
  const filtered = [age, country, month, cat].filter(Boolean).length;
  const href = (o: Partial<Q>) => `/abroad?${new URLSearchParams(Object.entries({ circuit, age, country, month, cat, open, ...o }).filter(([, v]) => v) as [string, string][]).toString()}`;
  const shown = rows.slice(0, limit);

  return (
    <Shell nav="abroad">
      <h1>{t('תחרויות נוער בחו״ל')}</h1>
      <p className="muted">{t('טורנירי נוער של Tennis Europe: מתי ואיפה הם מתקיימים, באיזו רמה, עד מתי אפשר להירשם ומה התנאים. הנתונים נלקחים מהאתר שלהם ועשויים להשתנות, ולכן כדאי לוודא מול האיגוד או המאמן איך נרשמים.')}</p>
      <details className="filters" style={{ marginTop: 12 }}>
        <summary>{t('מה זה קטגוריות, ואיך יודעים לאיזה טורניר להירשם?')}</summary>
        <div className="card grid" style={{ gap: 10, marginTop: 8 }}>
          <span><strong>{t('גיל (U12 / U14 / U16)')}:</strong> {t('הטורניר פתוח לשחקנים עד הגיל הזה בשנת הטורניר.')} {t('ב-')}{year}: U12 = {t('נולדו ב-')}{year - 12} {t('ואחריה')}, U14 = {year - 14} {t('ואחריה')}, U16 = {year - 16} {t('ואחריה')}.</span>
          <span><strong>{t('קטגוריה ב-Tennis Europe')}:</strong> {t('זו דרגת הטורניר. Super Category ו-Category 1 הן הדרגות הגבוהות, עם שדה חזק יותר ויותר נקודות לדירוג של Tennis Europe. Category 2 היא דרגה בינונית, ו-Category 3 היא דרגת הכניסה, הנגישה ביותר לשחקן שמתחיל לשחק בחו״ל. Festival הוא אירוע מיוחד.')}</span>
          <span><strong>{t('איך בוחרים?')}</strong> {t('מתחילים מהגיל, ואז בוחרים דרגה שמתאימה לרמה ולדירוג, ולתאריכים ולתקציב (דמי ההשתתפות מופיעים בכרטיס). ההרשמה בפועל נעשית דרך האיגוד או דרך אתר הטורניר (הכפתור "לדף הטורניר"), ולכן כדאי להתייעץ עם המאמן או האיגוד לפני שמחליטים.')}</span>
        </div>
      </details>
      <div className="row" style={{ marginTop: 12 }}>
        <Link scroll={false} href={href({ open: '', n: '' })} className={`pill ${open ? '' : 'lime'}`}>{t('הכול')} {inCircuit.length}</Link>
        <Link scroll={false} href={href({ open: '1', n: '' })} className={`pill ${open ? 'lime' : ''}`}>{t('עוד אפשר להירשם')} {openCount}</Link>
      </div>
      <details className="filters" open={filtered > 0}>
        <summary>{t('סינון')}{filtered ? ` · ${filtered}` : ''}</summary>
        <GetForm className="card row" style={{ marginTop: 8 }}>
          <input type="hidden" name="circuit" value={circuit} />
          {open && <input type="hidden" name="open" value="1" />}
          <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{[12, 14, 16].map((a) => <option key={a} value={a}>{t('גיל')} {a}</option>)}</select>
          <select name="country" defaultValue={country}><option value="">{t('כל המדינות')}</option>{opts((e) => e.country).map((c) => <option key={c} value={c}>{t(countryInfo(c).he)}</option>)}</select>
          <select name="month" defaultValue={month}><option value="">{t('כל החודשים')}</option>{opts((e) => monthKey(e.start)).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
          <select name="cat" defaultValue={cat}><option value="">{t('כל הקטגוריות')}</option>{opts((e) => e.category).map((c) => <option key={c} value={c}>{t(CAT_HE[c] ?? c)}</option>)}</select>
          <button className="btn">{t('הצגה')}</button>
          {filtered > 0 && <Link className="btn ghost" href={href({ age: '', country: '', month: '', cat: '', n: '' })}>{t('ניקוי')}</Link>}
        </GetForm>
      </details>
      <p className="muted" style={{ margin: '10px 0 0' }}>{rows.length} {t('טורנירים')}</p>
      {shown.length ? (
        <div className="grid cols" style={{ marginTop: 14 }}>
          {shown.map((e) => {
            const state = entryState(e, now);
            const deadline = state === 'open' && e.entryDeadline ? `${t('הרשמה עד')} ${dt(e.entryDeadline)}` : state === 'soon' && e.entryOpens ? `${t('ההרשמה נפתחת')} ${dm(e.entryOpens)}` : state === 'closed' ? t('ההרשמה נסגרה') : '';
            const place = [e.city, t(countryInfo(e.country).he)].filter(Boolean).join(', ');
            const terms = [e.fee && `${t('דמי השתתפות')}: ${e.fee}`, e.hospitality && `${t('אירוח')}: ${e.hospitality}`].filter(Boolean).join(' · ');
            return (
              <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className={`card grid comp ${state === 'open' ? 'open' : state === 'closed' ? 'done' : 'soon'}`} style={{ gap: 8 }}>
                <span className="top">
                  <span className={`pill ${state === 'open' ? 'ok' : state === 'soon' ? 'warn' : ''}`}>{state === 'open' ? t('פתוחה להרשמה') : state === 'soon' ? t('בקרוב') : state === 'closed' ? t('ההרשמה סגורה') : t('מועד הרשמה לא ידוע')}</span>
                  <span className="muted">{e.circuit === 'ITF' ? `ITF ${e.category}` : [e.age ? `U${e.age}` : '', e.category].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="dateblk"><b>{e.start.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric' })}</b><span>{e.start.toLocaleDateString('he-IL', { timeZone: TZ, month: 'short' })}</span></span>
                  <strong style={{ fontSize: 17, lineHeight: 1.3 }}>{e.name}</strong>
                </span>
                <span className="muted"><Flag country={e.country} /> {place} · {dm(e.start)} – {dy(e.end)}</span>
                {(e.surface || terms) && <span className="muted" style={{ fontSize: 13 }}>{[e.surface && (e.indoor ? `${e.surface} · ${t('מקורה')}` : e.surface), terms].filter(Boolean).join(' · ')}</span>}
                <span className="foot">
                  <span className="muted">{deadline}</span>
                  <span className={`act ${state === 'open' ? 'primary' : ''}`}>{t('לדף הטורניר')}</span>
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="card muted" style={{ marginTop: 14 }}>{t('אין טורנירים שמתאימים לסינון.')}</div>
      )}
      {rows.length > shown.length && <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}><Link scroll={false} className="btn ghost" href={href({ n: String(limit + PAGE) })}>{t('הצגת עוד')}</Link></div>}
    </Shell>
  );
}
