import Link from 'next/link';
import { GetForm } from '@/components/GetForm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { abroadCatalog, entryState, type AbroadRow } from '@/services/abroad';

export const dynamic = 'force-dynamic';

/** Countries as the circuits spell them -> Hebrew (anything missing shows as written). */
const COUNTRY_HE: Record<string, string> = {
  Albania: 'אלבניה', Andorra: 'אנדורה', Armenia: 'ארמניה', Austria: 'אוסטריה', Azerbaijan: 'אזרבייג׳ן', Belarus: 'בלארוס', Belgium: 'בלגיה', 'Bosnia/Herzegovina': 'בוסניה והרצגובינה',
  Bulgaria: 'בולגריה', Croatia: 'קרואטיה', Cyprus: 'קפריסין', Czechia: 'צ׳כיה', Denmark: 'דנמרק', Estonia: 'אסטוניה', 'Faroe Islands': 'איי פארו', Finland: 'פינלנד', France: 'צרפת',
  Georgia: 'גאורגיה', Germany: 'גרמניה', 'Great Britain': 'בריטניה', Greece: 'יוון', Hungary: 'הונגריה', Iceland: 'איסלנד', Ireland: 'אירלנד', Italy: 'איטליה', Kosovo: 'קוסובו', Latvia: 'לטביה',
  Liechtenstein: 'ליכטנשטיין', Lithuania: 'ליטא', Luxembourg: 'לוקסמבורג', Malta: 'מלטה', Moldova: 'מולדובה', Monaco: 'מונקו', Montenegro: 'מונטנגרו', Netherlands: 'הולנד',
  'North Macedonia': 'צפון מקדוניה', Norway: 'נורווגיה', Poland: 'פולין', Portugal: 'פורטוגל', Romania: 'רומניה', Russia: 'רוסיה', 'San Marino': 'סן מרינו', Serbia: 'סרביה',
  'Slovak Republic': 'סלובקיה', Slovakia: 'סלובקיה', 'Bosnia and Herzegovina': 'בוסניה והרצגובינה', 'Czech Republic': 'צ׳כיה', Turkey: 'טורקיה', 'United Kingdom': 'בריטניה',
  Slovenia: 'סלובניה', Spain: 'ספרד', Sweden: 'שוודיה', Switzerland: 'שווייץ', Turkiye: 'טורקיה', Ukraine: 'אוקראינה', Egypt: 'מצרים', Tunisia: 'תוניסיה', Morocco: 'מרוקו', Jordan: 'ירדן',
  USA: 'ארצות הברית', 'United States': 'ארצות הברית', Canada: 'קנדה', Mexico: 'מקסיקו', Brazil: 'ברזיל', Argentina: 'ארגנטינה', Japan: 'יפן', China: 'סין', India: 'הודו', Thailand: 'תאילנד',
  'Korea, Rep.': 'דרום קוריאה', 'Australia': 'אוסטרליה', 'South Africa': 'דרום אפריקה', 'United Arab Emirates': 'איחוד האמירויות', Qatar: 'קטאר', Kazakhstan: 'קזחסטן', Uzbekistan: 'אוזבקיסטן',
};
const heCountry = (c: string) => COUNTRY_HE[c] ?? c;
const TZ = 'Asia/Jerusalem';
const dm = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' });
const dy = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ });
const dt = (x: Date) => x.toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const monthKey = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const PAGE = 48;

type Q = { circuit?: string; age?: string; country?: string; month?: string; cat?: string; open?: string; n?: string };

/** Public to everyone: junior tournaments outside Israel (Tennis Europe and ITF, mirrored by the daily sync): when and where, the level, until when to enter, the fee. */
export default async function Abroad({ searchParams }: { searchParams: Promise<Q> }) {
  const t = await tr();
  const q = await searchParams;
  const { circuit = '', age = '', country = '', month = '', cat = '', open = '' } = q;
  const limit = Math.max(PAGE, Number(q.n) || PAGE);
  const now = new Date();
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
      <p className="muted">{t('טורנירי נוער של Tennis Europe ו-ITF: מתי ואיפה הם מתקיימים, באיזו רמה, עד מתי אפשר להירשם ומה התנאים. הנתונים נלקחים מהאתרים שלהם ועשויים להשתנות, ולכן כדאי לוודא מול האיגוד או המאמן איך נרשמים.')}</p>
      <nav className="tabs" style={{ margin: '12px 0 0' }} aria-label={t('מסלול')}>
        {([['', 'הכול'], ['TE', 'Tennis Europe'], ['ITF', 'ITF']] as const).map(([k, label]) => <Link key={k} scroll={false} href={href({ circuit: k, age: '', country: '', month: '', cat: '', n: '' })} className={circuit === k ? 'on' : ''}>{t(label)}</Link>)}
      </nav>
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
          <select name="country" defaultValue={country}><option value="">{t('כל המדינות')}</option>{opts((e) => e.country).map((c) => <option key={c} value={c}>{t(heCountry(c))}</option>)}</select>
          <select name="month" defaultValue={month}><option value="">{t('כל החודשים')}</option>{opts((e) => monthKey(e.start)).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
          <select name="cat" defaultValue={cat}><option value="">{t('כל הקטגוריות')}</option>{opts((e) => e.category).map((c) => <option key={c} value={c}>{c}</option>)}</select>
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
            const place = [e.city, t(heCountry(e.country))].filter(Boolean).join(', ');
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
                <span className="muted">{place} · {dm(e.start)} – {dy(e.end)}</span>
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
