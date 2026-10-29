import { GetForm } from '@/components/GetForm';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { abroadCatalog, entryState, type AbroadRow } from '@/services/abroad';

export const dynamic = 'force-dynamic';

/** Countries as Tennis Europe spells them -> Hebrew (anything missing shows as written). */
const COUNTRY_HE: Record<string, string> = {
  Albania: 'אלבניה', Andorra: 'אנדורה', Armenia: 'ארמניה', Austria: 'אוסטריה', Azerbaijan: 'אזרבייג׳ן', Belarus: 'בלארוס', Belgium: 'בלגיה', 'Bosnia/Herzegovina': 'בוסניה והרצגובינה',
  Bulgaria: 'בולגריה', Croatia: 'קרואטיה', Cyprus: 'קפריסין', Czechia: 'צ׳כיה', Denmark: 'דנמרק', Estonia: 'אסטוניה', 'Faroe Islands': 'איי פארו', Finland: 'פינלנד', France: 'צרפת',
  Georgia: 'גאורגיה', Germany: 'גרמניה', 'Great Britain': 'בריטניה', Greece: 'יוון', Hungary: 'הונגריה', Iceland: 'איסלנד', Ireland: 'אירלנד', Italy: 'איטליה', Kosovo: 'קוסובו', Latvia: 'לטביה',
  Liechtenstein: 'ליכטנשטיין', Lithuania: 'ליטא', Luxembourg: 'לוקסמבורג', Malta: 'מלטה', Moldova: 'מולדובה', Monaco: 'מונקו', Montenegro: 'מונטנגרו', Netherlands: 'הולנד',
  'North Macedonia': 'צפון מקדוניה', Norway: 'נורווגיה', Poland: 'פולין', Portugal: 'פורטוגל', Romania: 'רומניה', Russia: 'רוסיה', 'San Marino': 'סן מרינו', Serbia: 'סרביה',
  'Slovak Republic': 'סלובקיה', Slovakia: 'סלובקיה', 'Bosnia and Herzegovina': 'בוסניה והרצגובינה', 'Czech Republic': 'צ׳כיה', Turkey: 'טורקיה', 'United Kingdom': 'בריטניה', Slovenia: 'סלובניה', Spain: 'ספרד', Sweden: 'שוודיה', Switzerland: 'שווייץ', Turkiye: 'טורקיה', Ukraine: 'אוקראינה',
};
const heCountry = (c: string) => COUNTRY_HE[c] ?? c;
const TZ = 'Asia/Jerusalem';
const d = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' });
const dy = (x: Date) => x.toLocaleDateString('he-IL', { timeZone: TZ });
const dt = (x: Date) => x.toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const monthKey = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** Public to everyone: Tennis Europe junior tournaments outside Israel (mirrored by the daily sync), to see when and where they are and until when to enter. */
export default async function Abroad({ searchParams }: { searchParams: Promise<{ age?: string; country?: string; month?: string; cat?: string; open?: string }> }) {
  const t = await tr();
  const { age = '', country = '', month = '', cat = '', open = '' } = await searchParams;
  const now = new Date();
  // events closed to other nations are not for our players to enter
  const all = (await abroadCatalog(db)).filter((e) => !e.closed);
  const rows = all.filter((e) => (!age || String(e.age) === age) && (!country || e.country === country) && (!month || monthKey(e.start) === month) && (!cat || e.category === cat)
    && (!open || ['open', 'soon'].includes(entryState(e, now))));
  const opts = (f: (e: AbroadRow) => string | null) => [...new Set(all.map(f).filter((x): x is string => !!x))].sort();
  const months = opts((e) => monthKey(e.start));
  const groups = new Map<string, AbroadRow[]>();
  for (const e of rows) groups.set(monthKey(e.start), [...(groups.get(monthKey(e.start)) ?? []), e]);
  const active = [age, country, month, cat, open].filter(Boolean).length;

  return (
    <Shell nav="abroad">
      <h1>{t('תחרויות נוער בחו״ל')}</h1>
      <p className="muted">{t('טורנירי Tennis Europe לנוער: מתי ואיפה הם מתקיימים, באיזו רמה, עד מתי אפשר להירשם ומה התנאים. הנתונים נלקחים מ-Tennis Europe ועשויים להשתנות, ולכן כדאי לוודא מול האיגוד או המאמן איך נרשמים.')}</p>
      <GetForm className="card row" style={{ margin: '12px 0' }}>
        <select name="age" defaultValue={age}><option value="">{t('כל הגילאים')}</option>{[12, 14, 16].map((a) => <option key={a} value={a}>U{a}</option>)}</select>
        <select name="country" defaultValue={country}><option value="">{t('כל המדינות')}</option>{opts((e) => e.country).map((c) => <option key={c} value={c}>{t(heCountry(c))}</option>)}</select>
        <select name="month" defaultValue={month}><option value="">{t('כל החודשים')}</option>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
        <select name="cat" defaultValue={cat}><option value="">{t('כל הקטגוריות')}</option>{opts((e) => e.category).map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" name="open" value="1" defaultChecked={!!open} />{t('עוד אפשר להירשם')}</label>
        <button className="btn">{t('הצגה')}</button>
        {active > 0 && <a className="btn ghost" href="/abroad">{t('ניקוי')}</a>}
      </GetForm>
      <p className="muted">{rows.length} {t('טורנירים')}</p>
      {[...groups].map(([m, items]) => (
        <section key={m}>
          <h2>{monthName(m)}</h2>
          <div className="grid cols">
            {items.map((e) => {
              const state = entryState(e, now);
              return (
                <details key={e.id} className="card grid" style={{ gap: 8 }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                    <div className="grid" style={{ gap: 6 }}>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {e.age && <span className="pill">U{e.age}</span>}
                        {e.category && <span className="pill">{e.category}</span>}
                        {state === 'open' && e.entryDeadline && <span className="pill ok">{t('פתוחה להרשמה עד')} {dt(e.entryDeadline)}</span>}
                        {state === 'soon' && e.entryOpens && <span className="pill warn">{t('ההרשמה נפתחת')} {d(e.entryOpens)}</span>}
                        {state === 'closed' && <span className="pill">{t('ההרשמה נסגרה')}</span>}
                      </div>
                      <strong style={{ fontSize: 17 }}>{e.name}</strong>
                      <span>{[e.city, t(heCountry(e.country))].filter(Boolean).join(', ')}</span>
                      <span className="muted">{d(e.start)} – {dy(e.end)}</span>
                    </div>
                  </summary>
                  <div className="grid" style={{ gap: 6, marginTop: 8 }}>
                    {e.venue && <span><span className="muted">{t('מועדון')}: </span>{e.venue}</span>}
                    {(e.surface || e.indoor !== null) && <span><span className="muted">{t('משטח')}: </span>{[e.surface, e.indoor === null ? '' : e.indoor ? t('מקורה') : t('פתוח')].filter(Boolean).join(' · ')}</span>}
                    {e.fee && <span><span className="muted">{t('דמי השתתפות')}: </span><span dir="ltr">{e.fee}</span></span>}
                    {e.hospitality && <span><span className="muted">{t('אירוח')}: </span><span dir="ltr">{e.hospitality}</span></span>}
                    {e.entryDeadline && <span><span className="muted">{t('מועד אחרון להרשמה')}: </span>{dt(e.entryDeadline)}</span>}
                    {e.withdrawalDeadline && <span><span className="muted">{t('מועד אחרון לביטול')}: </span>{dt(e.withdrawalDeadline)}</span>}
                    <a className="btn ghost" href={e.url} target="_blank" rel="noopener noreferrer" style={{ width: 'fit-content' }}>{t('לדף הטורניר ב-Tennis Europe')}</a>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ))}
      {!rows.length && <div className="card muted">{t('אין טורנירים שמתאימים לסינון.')}</div>}
    </Shell>
  );
}
