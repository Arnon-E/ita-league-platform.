import { GetForm } from '@/components/GetForm';
import { photoUrl } from '@/lib/photos';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, schema } from '@/db';
import { getActor } from '@/lib/session';
import { Flash, Shell } from '@/components/Shell';
import { FollowButton } from '@/components/FollowButton';
import { MatchScore } from '@/components/MatchScore';
import { eq } from 'drizzle-orm';
import { Gallery } from './Gallery';
import { listPhotos } from '@/services/gallery';
import { tr } from '@/lib/i18n';
import { tournamentDetail, playersNotIn } from '@/services/queries';
import { groupStandings } from '@/services/results';
import { doublesTables } from '@/services/doubles';
import { listCourtLabels } from '@/services/tournaments';
import { formatOf } from '@/services/draws';
import { bracketLayout, roundName } from '@/services/bracket';
import { loadRuleSet } from '@/services/rules';
import { myPlayerRows } from '@/services/home';
import { ineligibleReason, relevantFor } from '@/services/eligibility';
import { AutoSelect } from '@/components/AutoSelect';
import { FORMAT, fmtDate, fmtTime, GENDER, LEVEL, MSTATUS, NEXT, STATUS, fmtScore } from '@/components/labels';
import { refundAction } from '@/app/actions3';
import { suggestedRefund } from '@/services/payments';
import {
  autoScheduleAction, categoryAction, courtsAction, drawAction, entryAction, registerAction, slotAction, statusAction,
} from '@/app/actions';

type Detail = NonNullable<Awaited<ReturnType<typeof tournamentDetail>>>;
const TABS: [string, string][] = [['overview', 'סקירה'], ['entries', 'משתתפים'], ['draw', 'הגרלה וטבלאות'], ['results', 'משחקים ותוצאות'], ['schedule', 'לוח משחקים'], ['doubles', 'זוגות'], ['gallery', 'גלריה']];

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; err?: string; ok?: string; cat?: string; dc?: string; g?: string; age?: string; for?: string; all?: string }> }) {
  const tt = await tr();
  const { id } = await params;
  const sp = await searchParams;
  const { err, ok, g = '', age = '' } = sp;
  const explicitFilter = sp.g !== undefined || sp.age !== undefined || sp.cat !== undefined || sp.all === '1';
  const d = await tournamentDetail(db, id);
  if (!d) notFound();
  const { t } = d;
  const actor = await getActor();
  const manage = !!actor && ['SUPER_ADMIN', 'FEDERATION_ADMIN', 'TOURNAMENT_MANAGER'].includes(actor.role);
  const scorer = manage || actor?.role === 'REFEREE';
  const rulesVerified = (await loadRuleSet(db, t.ruleSetId)).verified;
  const [st, cls] = STATUS[t.status] ?? [t.status, ''];
  // Public visitors only see tabs that have something in them; staff see them all, and a tab opened by link stays visible.
  const photoCount = manage ? 1 : (await listPhotos(db, t.id)).length;
  const hasContent: Record<string, boolean> = {
    overview: true,
    entries: d.ents.some((x) => x.e.status === 'CONFIRMED'),
    draw: d.draws.some((x) => x.publishedAt),
    results: d.ms.some((m) => m.status !== 'SCHEDULED'),
    schedule: d.ms.some((m) => m.scheduledStart && m.aEntryId && m.bEntryId),
    doubles: d.doubles.length > 0,
    gallery: photoCount > 0,
  };
  // A signed-in player or parent lands on their own player's category: the filters, the category and the tab are chosen for them.
  const owned = !manage && actor ? await myPlayerRows(db, actor).catch(() => []) : [];
  // Arriving from a player's page (?for=<player>): that player is the focus, whoever is viewing.
  const viewed = sp.for && !owned.some((x) => x.id === sp.for) ? d.ents.find((x) => x.e.playerId === sp.for)?.p : undefined;
  const mine: Mine = viewed ? [viewed] : owned;
  const focus = focusFor(d, mine, sp.for ?? '');
  const useFocus = !!focus && !explicitFilter;
  const flt = useFocus && focus!.cat
    ? { g: focus!.cat.gender === 'MALE' || focus!.cat.gender === 'FEMALE' ? focus!.cat.gender : '', age: ageOf(focus!.cat.name) }
    : { g: g === 'MALE' || g === 'FEMALE' ? g : '', age: /^\d{2}$/.test(age) ? age : '' };
  const cat = sp.cat ?? (useFocus ? focus!.entries[0]?.e.categoryId ?? '' : '');
  const tab = sp.tab ?? (useFocus && focus!.entries.length ? (hasContent.draw ? 'draw' : hasContent.results ? 'results' : 'overview') : hasContent.doubles && !hasContent.draw && !hasContent.results ? 'doubles' : 'overview');
  const tabs = TABS.filter(([k]) => manage || k === tab || hasContent[k]);
  return (
    <Shell nav="home">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}><span className={`pill ${cls}`}>{tt(st)}</span><h1 style={{ marginTop: 6 }}>{t.name}</h1><span className="muted">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</span></div>
        <FollowButton kind="TOURNAMENT" target={t.id} back={`/tournaments/${t.id}`} />
      </div>
      {focus && focus.entries.length > 0 && <MyPlayerCard d={d} focus={focus} mine={mine} showAll={useFocus} />}
      <nav className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/tournaments/${id}?tab=${k}${sp.for ? `&for=${sp.for}` : ''}${explicitFilter ? '' : ''}`} className={tab === k ? 'on' : ''}>{tt(l)}</Link>)}</nav>
      <Flash err={err} ok={ok} />
      {manage && !rulesVerified && <div className="err" style={{ background: 'var(--warnbg)', color: 'var(--warn)' }}>ערכת החוקים של התחרות טרם אומתה מול תקנוני האיגוד. ההגרלה והנקודות עשויות לא להתאים לתקנון.</div>}
      {tab === 'overview' && (useFocus ? <details className="filters"><summary>{tt('שינוי קטגוריה')}</summary><CatFilter d={d} tab="overview" cat="" flt={flt} withCats={false} /></details> : <CatFilter d={d} tab="overview" cat="" flt={flt} withCats={false} />)}
      {tab === 'overview' && <Overview d={narrow(d, flt)} manage={manage} compact={!!focus} registered={!!focus && focus.entries.length > 0} />}
      {tab === 'entries' && <Entries d={d} manage={manage} />}
      {(tab === 'draw' || tab === 'results' || tab === 'schedule') && (useFocus ? <details className="filters"><summary>{tt('שינוי קטגוריה')}</summary><CatFilter d={d} tab={tab} cat={cat} flt={flt} withCats /></details> : <CatFilter d={d} tab={tab} cat={cat} flt={flt} withCats />)}
      {tab === 'draw' && <DrawTab d={sp.cat ? pick(narrow(d, flt), cat) : ageGroup(narrow(d, flt), cat)} manage={manage} hl={new Set((focus?.entries ?? []).map((x) => x.e.id))} />}
      {tab === 'results' && <Results d={pick(narrow(d, flt), cat)} scorer={scorer} hl={new Set((focus?.entries ?? []).map((x) => x.e.id))} />}
      {tab === 'schedule' && <Schedule d={pick(narrow(d, flt), cat)} manage={manage} />}
      {tab === 'doubles' && <DoublesTab d={d} dc={sp.dc ?? ''} tab={tab} forId={sp.for} />}
      {tab === 'gallery' && <Gallery tournamentId={t.id} manage={scorer} />}
    </Shell>
  );
}

/**
 * The draw of an age group when no single category was clicked: the chosen (or first) category and the others of the same gender
 * and age, so choosing "boys, 14" shows the group stage, the playoff tree and the qualifying draw that make up that event.
 */
const ageGroup = (d: Detail, cat: string): Detail => {
  const base = d.cats.find((x) => x.id === cat) ?? d.cats[0];
  if (!base) return d;
  const order = (c: Detail['cats'][number]) => (c.id === base.id ? 0 : /פלייאוף|גמר/.test(c.name) ? 1 : 2);
  const cats = d.cats.filter((c) => c.gender === base.gender && ageOf(c.name) === ageOf(base.name)).sort((a, b) => order(a) - order(b));
  const ids = new Set(cats.map((c) => c.id));
  return { ...d, cats, ms: d.ms.filter((m) => ids.has(m.categoryId)) };
};

/** Big competitions have 15-30 categories: draw and results show one category at a time (the first by default). */
const pick = (d: Detail, cat: string): Detail => {
  if (d.cats.length <= 1) return d;
  const c = d.cats.find((x) => x.id === cat) ?? d.cats[0]!;
  return { ...d, cats: [c], ms: d.ms.filter((m) => m.categoryId === c.id) };
};

type Flt = { g: string; age: string };
const ageOf = (name: string) => (name.match(/(\d{2})/) ?? [])[1] ?? '';

type Mine = Awaited<ReturnType<typeof myPlayerRows>>;
/** Which of the viewer's players this page is about, and their category: the one they are entered in, else the youngest age group that fits. */
function focusFor(d: Detail, mine: Mine, forId: string) {
  const entriesOf = (p: Mine[number]) => d.ents.filter((x) => x.e.playerId === p.id && x.e.status !== 'WITHDRAWN' && x.e.status !== 'REJECTED');
  const p = mine.find((x) => x.id === forId) ?? mine.find((x) => entriesOf(x).length > 0) ?? mine.find((x) => relevantFor(x, d.t, d.cats));
  if (!p) return null;
  const entries = entriesOf(p);
  const cat = d.cats.find((c) => c.id === entries[0]?.e.categoryId)
    ?? d.cats.filter((c) => !ineligibleReason(p, c, d.t)).sort((a, b) => Number(ageOf(a.name) || 99) - Number(ageOf(b.name) || 99))[0];
  return { p, cat, entries };
}

/** The player this page is opened for: where they stand in this competition, their next match and latest results. */
async function MyPlayerCard({ d, focus, mine, showAll }: { d: Detail; focus: NonNullable<ReturnType<typeof focusFor>>; mine: Mine; showAll: boolean }) {
  const tt = await tr();
  const { p, entries } = focus;
  const myEntryIds = new Set(entries.map((x) => x.e.id));
  const mineMs = d.ms.filter((m) => (m.aEntryId && myEntryIds.has(m.aEntryId)) || (m.bEntryId && myEntryIds.has(m.bEntryId)));
  const nowMs = Date.now();
  const live = d.t.status !== 'FINISHED' && d.t.status !== 'CANCELLED';
  const next = mineMs.filter((m) => live && m.status === 'SCHEDULED' && m.aEntryId && m.bEntryId && (!m.scheduledStart || m.scheduledStart.getTime() >= nowMs - 864e5)).sort((a, b) => (a.scheduledStart?.getTime() ?? Infinity) - (b.scheduledStart?.getTime() ?? Infinity))[0];
  const played = mineMs.filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.winnerEntryId)
    .sort((a, b) => (b.scheduledStart?.getTime() ?? 0) - (a.scheduledStart?.getTime() ?? 0)).slice(0, 3);
  const opp = (m: (typeof d.ms)[number]) => d.names.get((m.aEntryId && myEntryIds.has(m.aEntryId) ? m.bEntryId : m.aEntryId) ?? '') ?? '';
  const iAmA = (m: (typeof d.ms)[number]) => !!m.aEntryId && myEntryIds.has(m.aEntryId);
  const catNames = entries.map((x) => d.cats.find((c) => c.id === x.e.categoryId)?.name).filter(Boolean).join(' · ');
  const open = d.t.status === 'REGISTRATION_OPEN';
  return (
    <section className="card grid" style={{ gap: 10, marginBottom: 12 }}>
      <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {photoUrl(p.photo) ? <img className="pavatar-img" style={{ width: 52, height: 52 }} src={photoUrl(p.photo)!} alt="" referrerPolicy="no-referrer" /> : <span className="pavatar" aria-hidden style={{ width: 52, height: 52, fontSize: 18 }}>{p.firstName.charAt(0)}</span>}
          <div style={{ minWidth: 0 }}>
            <Link href={`/players/${p.id}`}><strong style={{ fontSize: 18 }}>{p.firstName} {p.lastName}</strong></Link>
            <div className="muted">{entries.length ? `${tt('רשום')}: ${catNames}` : open ? tt('עדיין לא רשום לתחרות הזו') : tt('לא משתתף בתחרות הזו')}</div>
          </div>
        </div>
        {!entries.length && open && <Link className="btn small" href="/me">{tt('להרשמה')}</Link>}
      </div>
      {mine.length > 1 && (
        <div className="row">{mine.map((x) => <Link scroll={false} key={x.id} href={`/tournaments/${d.t.id}?for=${x.id}`} className={`pill ${x.id === p.id ? 'lime' : ''}`}>{x.firstName}</Link>)}</div>
      )}
      {next && (
        <div className="muted"><strong style={{ color: 'var(--text)' }}>{tt('המשחק הבא')}:</strong> {opp(next) || tt('יתברר')}{next.scheduledStart ? ` · ${fmtTime(next.scheduledStart)}` : ''}{next.courtLabel ? ` · ${tt('מגרש')} ${next.courtLabel}` : ''}</div>
      )}
      {played.length > 0 && (
        <div className="grid" style={{ gap: 4 }}>
          {played.map((m) => {
            const won = !!m.winnerEntryId && myEntryIds.has(m.winnerEntryId);
            const sets = ((m.sets ?? []) as { a: number; b: number }[]).map((x) => (iAmA(m) ? x : { a: x.b, b: x.a }));
            return <Link key={m.id} href={`/matches/${m.id}`} className="row"><span className={`pill ${won ? 'ok' : 'bad'}`}>{won ? tt('ניצחון') : tt('הפסד')}</span><span>{opp(m)}</span><span className="muted" dir="ltr">{fmtScore(sets)}</span></Link>;
          })}
        </div>
      )}
      {(() => {
        const koCat = entries.map((x) => x.e.categoryId).find((c) => d.ms.some((m) => m.categoryId === c && m.stage === 'KO'));
        return koCat ? <Link className="btn small ghost" style={{ justifySelf: 'start' }} href={`/tournaments/${d.t.id}?tab=draw&cat=${koCat}${mine.length > 1 ? `&for=${p.id}` : ''}`}>{tt('עץ התחרות')}</Link> : null;
      })()}
      {showAll && <Link className="muted" href={`/tournaments/${d.t.id}?all=1&tab=overview`}><u>{tt('הצגת כל הקטגוריות והמשתתפים')}</u></Link>}
    </section>
  );
}

/** Keeps only the categories matching the chosen gender and age (and their matches). */
const narrow = (d: Detail, f: Flt): Detail => {
  if (!f.g && !f.age) return d;
  const cats = d.cats.filter((c) => (!f.g || c.gender === f.g) && (!f.age || ageOf(c.name) === f.age));
  const ids = new Set(cats.map((c) => c.id));
  return { ...d, cats, ms: d.ms.filter((m) => ids.has(m.categoryId)), ents: d.ents.filter((x) => ids.has(x.e.categoryId)) };
};

/** Filter row for big competitions: gender, age, then the matching categories one at a time. */
async function CatFilter({ d, tab, cat, flt, withCats }: { d: Detail; tab: string; cat: string; flt: Flt; withCats: boolean }) {
  const tt = await tr();
  if (d.cats.length <= 1) return null;
  const ages = [...new Set(d.cats.map((c) => ageOf(c.name)).filter(Boolean))].sort();
  const genders = [...new Set(d.cats.map((c) => c.gender).filter((x) => x === 'MALE' || x === 'FEMALE'))];
  const url = (o: Partial<Flt> & { cat?: string }) => {
    const p = new URLSearchParams({ tab, g: o.g ?? flt.g, age: o.age ?? flt.age });
    if (o.cat) p.set('cat', o.cat);
    return `/tournaments/${d.t.id}?${p.toString()}`;
  };
  const shown = narrow(d, flt).cats;
  const cur = (shown.find((x) => x.id === cat) ?? shown[0])?.id;
  return (
    <div className="grid" style={{ gap: 12, margin: '8px 0 16px' }}>
      <div className="row">
        {genders.length > 1 && <>
          <Link scroll={false} href={url({ g: '' })} className={`pill ${!flt.g ? 'lime' : ''}`}>{tt('בנים ובנות')}</Link>
          {genders.includes('MALE') && <Link scroll={false} href={url({ g: 'MALE' })} className={`pill ${flt.g === 'MALE' ? 'lime' : ''}`}>{tt('בנים')}</Link>}
          {genders.includes('FEMALE') && <Link scroll={false} href={url({ g: 'FEMALE' })} className={`pill ${flt.g === 'FEMALE' ? 'lime' : ''}`}>{tt('בנות')}</Link>}
        </>}
        {ages.length > 1 && <>
          <span className="muted">|</span>
          <Link scroll={false} href={url({ age: '' })} className={`pill ${!flt.age ? 'lime' : ''}`}>{tt('כל הגילאים')}</Link>
          {ages.map((a) => <Link scroll={false} key={a} href={url({ age: a })} className={`pill ${flt.age === a ? 'lime' : ''}`}>{tt('גיל')} {a}</Link>)}
        </>}
      </div>
      {withCats && (
        shown.length > 8 ? (
          <GetForm className="row" action={`/tournaments/${d.t.id}`}>
            <input type="hidden" name="tab" value={tab} /><input type="hidden" name="g" value={flt.g} /><input type="hidden" name="age" value={flt.age} />
            <AutoSelect name="cat" defaultValue={cur} aria-label={tt("קטגוריה")} style={{ flex: 1, minWidth: 220 }}>
              {shown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </AutoSelect>
            <span className="muted">{shown.length} {tt('קטגוריות. צמצמו לפי בנים/בנות וגיל למעלה.')}</span>
          </GetForm>
        ) : (
          <div className="row">
            {shown.map((c) => <Link scroll={false} key={c.id} href={url({ cat: c.id })} className={`pill ${cur === c.id ? 'lime' : ''}`}>{c.name}</Link>)}
            {!shown.length && <span className="muted">{tt('אין קטגוריות לפי הסינון.')}</span>}
          </div>
        )
      )}
    </div>
  );
}

const STEPS = ['הרשמה', 'הגרלה', 'משחקים', 'סיום'];
const STEP_OF: Record<string, number> = { DRAFT: 0, REGISTRATION_OPEN: 0, REGISTRATION_CLOSED: 1, DRAWN: 2, IN_PROGRESS: 2, FINISHED: 3 };

async function Overview({ d, manage, compact = false, registered = false }: { d: Detail; manage: boolean; compact?: boolean; registered?: boolean }) {
  const tt = await tr();
  const { t, cats, ents } = d;
  const venue = t.venueId ? (await db.select().from(schema.venues).where(eq(schema.venues.id, t.venueId)))[0] : undefined;
  const days = Math.max(1, Math.round((+t.endDate - +t.startDate) / 864e5) + 1);
  const confirmed = ents.filter((x) => x.e.status === 'CONFIRMED').length;
  const closesIn = t.status === 'REGISTRATION_OPEN' && t.registrationCloses ? Math.ceil((+t.registrationCloses - Date.now()) / 864e5) : null;
  const step = STEP_OF[t.status];
  const facts: [string, string][] = [
    ['תאריכים', `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)} · ${days} ${tt('ימים')}`],
    ...(venue ? [['מקום', [venue.name, venue.city].filter(Boolean).join(', ')] as [string, string]] : []),
    ['סוג', `${tt(LEVEL[t.level] ?? '')} · ${tt(FORMAT[t.format] ?? '')}`],
    ...(t.feeAgorot > 0 ? [['דמי השתתפות', `₪${(t.feeAgorot / 100).toFixed(0)}`] as [string, string]] : []),
    ['קטגוריות', `${cats.length}${confirmed ? ` · ${confirmed} ${tt('משתתפים מאושרים')}` : ''}`],
  ];
  return (
    <>
      {manage ? <div className="card row">
        {(NEXT[t.status] ?? []).map(([to, label]) => (
          <form key={to} action={statusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="to" value={to} /><button className="btn">{label}</button></form>
        ))}
        {t.status !== 'CANCELLED' && t.status !== 'FINISHED' && (
          <form action={statusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="to" value="CANCELLED" /><button className="btn ghost">ביטול תחרות</button></form>
        )}
        <span className="muted">דמי השתתפות: ₪{(t.feeAgorot / 100).toFixed(0)}</span>
      </div> : null}
      {!manage && compact && (
        <>
          {t.status === 'REGISTRATION_OPEN' && !registered && <div className="row">{t.registerUrl ? <a className="btn" href={t.registerUrl} target="_blank" rel="noopener noreferrer">{tt('להרשמה')}</a> : <Link className="btn" href="/me">{tt('להרשמה')}</Link>}</div>}
          <details className="filters"><summary>{tt('פרטי התחרות, מועדי הרשמה ודמי השתתפות')}</summary>
            <div className="grid" style={{ gap: 10, marginTop: 8 }}>
      {(t.registerUrl || t.registrationCloses || t.sourceUrl || t.feeAgorot > 0 || t.status === 'REGISTRATION_OPEN') && (
        <div className="card grid" style={{ gap: 10 }}>
          {t.status === 'REGISTRATION_OPEN' && (
            <div className="row">
              {t.registerUrl
                ? <a className="btn" href={t.registerUrl} target="_blank" rel="noopener noreferrer">{tt('להרשמה')}</a>
                : <Link className="btn" href="/me">{tt('להרשמה')}</Link>}
              {t.registerUrl && <span className="muted">{tt('ההרשמה מתבצעת באתר Loglig, באתר נפרד שנפתח בלשונית חדשה.')}</span>}
            </div>
          )}
          <div className="row" style={{ gap: 18 }}>
            {t.registrationCloses && <span><strong>{tt('ההרשמה נסגרת')}:</strong> {t.registrationCloses.toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jerusalem' })}</span>}
            {t.feeAgorot > 0 && <span><strong>{tt('דמי השתתפות')}:</strong> ₪{(t.feeAgorot / 100).toFixed(0)}</span>}
            {t.sourceUrl && <a className="muted" href={t.sourceUrl} target="_blank" rel="noopener noreferrer"><u>{tt('עמוד התחרות באתר האיגוד')}</u></a>}
          </div>
        </div>
      )}
      {!manage && (
        <>
          <dl className="facts card">
            {facts.map(([k, v]) => <div key={k}><dt>{tt(k)}</dt><dd>{v}</dd></div>)}
          </dl>
          {step !== undefined && t.status !== 'CANCELLED' && (
            <ol className="steps" aria-label={tt('שלבי התחרות')}>
              {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{tt(s)}</li>)}
            </ol>
          )}
          {closesIn !== null && closesIn >= 0 && <p className="muted" style={{ margin: 0 }}>{closesIn === 0 ? tt('ההרשמה נסגרת היום') : `${tt('נותרו')} ${closesIn} ${tt('ימים להרשמה')}`}</p>}
        </>
      )}
            </div>
          </details>
        </>
      )}
      {!manage && !compact && (
        <>
      {(t.registerUrl || t.registrationCloses || t.sourceUrl || t.feeAgorot > 0 || t.status === 'REGISTRATION_OPEN') && (
        <div className="card grid" style={{ gap: 10 }}>
          {t.status === 'REGISTRATION_OPEN' && (
            <div className="row">
              {t.registerUrl
                ? <a className="btn" href={t.registerUrl} target="_blank" rel="noopener noreferrer">{tt('להרשמה')}</a>
                : <Link className="btn" href="/me">{tt('להרשמה')}</Link>}
              {t.registerUrl && <span className="muted">{tt('ההרשמה מתבצעת באתר Loglig, באתר נפרד שנפתח בלשונית חדשה.')}</span>}
            </div>
          )}
          <div className="row" style={{ gap: 18 }}>
            {t.registrationCloses && <span><strong>{tt('ההרשמה נסגרת')}:</strong> {t.registrationCloses.toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jerusalem' })}</span>}
            {t.feeAgorot > 0 && <span><strong>{tt('דמי השתתפות')}:</strong> ₪{(t.feeAgorot / 100).toFixed(0)}</span>}
            {t.sourceUrl && <a className="muted" href={t.sourceUrl} target="_blank" rel="noopener noreferrer"><u>{tt('עמוד התחרות באתר האיגוד')}</u></a>}
          </div>
        </div>
      )}
      {!manage && (
        <>
          <dl className="facts card">
            {facts.map(([k, v]) => <div key={k}><dt>{tt(k)}</dt><dd>{v}</dd></div>)}
          </dl>
          {step !== undefined && t.status !== 'CANCELLED' && (
            <ol className="steps" aria-label={tt('שלבי התחרות')}>
              {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{tt(s)}</li>)}
            </ol>
          )}
          {closesIn !== null && closesIn >= 0 && <p className="muted" style={{ margin: 0 }}>{closesIn === 0 ? tt('ההרשמה נסגרת היום') : `${tt('נותרו')} ${closesIn} ${tt('ימים להרשמה')}`}</p>}
        </>
      )}
        </>
      )}
      <h2>{tt('קטגוריות')} <span className="muted" style={{ fontWeight: 400 }}>· {cats.length}</span></h2>
      {ents.length === 0 && cats.length > 0 && <p className="muted" style={{ margin: 0 }}>{tt('עדיין אין משתתפים מאושרים באתר.')}</p>}
      <div className="grid cols">
        {cats.map((c) => (
          <div key={c.id} className="card grid" style={{ gap: 4 }}>
            <strong>{c.name}</strong>
            <span className="muted">{tt(GENDER[c.gender] ?? '')} · {tt(FORMAT[formatOf(c, t)] ?? '')}{c.capacity ? ` · ${tt('עד')} ${c.capacity}` : ''}</span>
            {ents.some((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED') && (
              <details className="filters" style={{ marginTop: 6 }}>
                <summary>{tt('משתתפים')} ({ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED').length})</summary>
                <ul className="plist">
                  {ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED').sort((a, b) => a.p.lastName.localeCompare(b.p.lastName, 'he')).map((x) => (
                    <li key={x.e.id}>
                      {photoUrl(x.p.photo) ? <img src={photoUrl(x.p.photo)!} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" /> : <span className="pavatar" aria-hidden style={{ width: 40, height: 40, fontSize: 15 }}>{x.p.firstName.charAt(0)}</span>}
                      <Link href={`/players/${x.p.id}`}><strong>{x.p.firstName} {x.p.lastName}</strong></Link>
                      {x.club && <span className="muted">{x.club}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {ents.length > 0 && <span className="muted">{(() => {
              const ok = ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED').length;
              const wait = ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'PENDING').length;
              return ok + wait === 0 ? tt('עדיין אין נרשמים') : `${ok} ${tt('מאושרים')}${wait ? ` · ${wait} ${tt('ממתינים')}` : ''}`;
            })()}</span>}
          </div>
        ))}
      </div>
      {manage && <ClubTable d={d} />}
      {manage && <><h2>הוספת קטגוריה</h2>
      <form action={categoryAction} className="card row">
        <input type="hidden" name="id" value={t.id} />
        <label>שם<input name="name" required /></label>
        <label>מין<select name="gender">{Object.entries(GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>פורמט<select name="format"><option value="">כברירת מחדל</option>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>מקסימום משתתפים<input name="capacity" type="number" min="2" style={{ width: 120 }} /></label>
        <label>גודל בית<input name="groupSize" type="number" min="3" defaultValue="4" style={{ width: 90 }} /></label>
        <label>עולים מכל בית<input name="advancers" type="number" min="1" defaultValue="2" style={{ width: 90 }} /></label>
        <button className="btn">הוספה</button>
      </form></>}
    </>
  );
}

async function ClubTable({ d }: { d: Detail }) {
  const tt = await tr();
  const clubOf = new Map(d.ents.filter((x) => x.e.status === 'CONFIRMED').map((x) => [x.e.id, x.club ?? tt('ללא מועדון')]));
  const rows = new Map<string, { players: number; played: number; wins: number }>();
  const row = (c: string) => rows.get(c) ?? rows.set(c, { players: 0, played: 0, wins: 0 }).get(c)!;
  for (const c of clubOf.values()) row(c).players++;
  for (const m of d.ms) {
    if (!m.winnerEntryId) continue;
    for (const e of [m.aEntryId, m.bEntryId]) { const c = e && clubOf.get(e); if (c) row(c).played++; }
    const w = clubOf.get(m.winnerEntryId); if (w) row(w).wins++;
  }
  const list = [...rows].sort((a, b) => b[1].wins - a[1].wins || b[1].players - a[1].players);
  if (!list.length) return null;
  return (
    <>
      <h2>{tt('טבלת מועדונים')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>#</th><th>{tt('מועדון')}</th><th>{tt('שחקנים')}</th><th>{tt('משחקים')}</th><th>{tt('ניצחונות')}</th></tr></thead><tbody>
          {list.map(([c, r], i) => <tr key={c}><td>{i + 1}</td><td>{c}</td><td>{r.players}</td><td>{r.played}</td><td><strong>{r.wins}</strong></td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}

async function Entries({ d, manage }: { d: Detail; manage: boolean }) {
  const tt = await tr();
  const { t, cats, ents } = d;
  if (!manage) {
    return (
      <>
        {cats.map((c) => {
          const list = ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED');
          return (
            <section key={c.id}>
              <h2>{c.name} <span className="muted" style={{ fontWeight: 400 }}>· {list.length} {tt('משתתפים')}</span></h2>
              <div className="card" style={{ overflow: 'auto' }}>
                <table><thead><tr><th>#</th><th>{tt('שחקן')}</th><th>{tt('מועדון')}</th></tr></thead><tbody>
                  {list.map(({ p, club }, i) => <tr key={p.id}><td>{i + 1}</td><td><Link href={`/players/${p.id}`}>{p.firstName} {p.lastName}</Link></td><td>{club ?? '—'}</td></tr>)}
                </tbody></table>
                {!list.length && <p className="muted">{tt('אין עדיין משתתפים מאושרים.')}</p>}
              </div>
            </section>
          );
        })}
        {!cats.length && <div className="card muted">{tt('אין קטגוריות.')}</div>}
      </>
    );
  }
  const open = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(t.status);
  const addable = await Promise.all(cats.map(async (c) => [c.id, await playersNotIn(db, c.id, c.gender)] as const));
  const docs = await db.select().from(schema.documents);
  const pays = await db.select().from(schema.payments);
  const sugg = new Map<string, number>();
  for (const { e } of ents) if (e.paymentStatus === 'PAID' || e.paymentStatus === 'PARTIALLY_REFUNDED') sugg.set(e.id, (await suggestedRefund(db, e.id)).amountAgorot);
  return (
    <>
      {cats.map((c) => (
        <section key={c.id}>
          <h2>{c.name}</h2>
          <div className="card" style={{ overflow: 'auto' }}>
            <table>
              <thead><tr><th>שחקן</th><th>מועדון</th><th>מסמכים</th><th>תשלום</th><th>סטטוס</th><th /></tr></thead>
              <tbody>
                {ents.filter((x) => x.e.categoryId === c.id).map(({ e, p, club }) => {
                  const approved = new Set(docs.filter((x) => x.playerId === p.id && x.status === 'APPROVED').map((x) => x.type));
                  const docsOk = approved.has('ID_PHOTO') && approved.has('MEDICAL_CERTIFICATE');
                  return (
                    <tr key={e.id}>
                      <td>{p.firstName} {p.lastName}</td><td>{club ?? '—'}</td>
                      <td><span className={`pill ${docsOk ? 'ok' : 'warn'}`}>{docsOk ? 'תקין' : 'חסר'}</span></td>
                      <td><span className={`pill ${e.paymentStatus === 'PAID' ? 'ok' : e.paymentStatus === 'UNPAID' ? 'warn' : ''}`}>{e.paymentStatus === 'PAID' ? 'שולם' : e.paymentStatus === 'UNPAID' ? 'לא שולם' : e.paymentStatus === 'REFUNDED' ? 'הוחזר' : 'הוחזר חלקית'}</span></td>
                      <td><span className="pill">{{ PENDING: 'ממתין', CONFIRMED: 'מאושר', WAITLIST: 'המתנה', WITHDRAWN: 'פרש', REJECTED: 'נדחה' }[e.status]}</span></td>
                      <td>
                        <div className="row">
                          {e.paymentStatus === 'UNPAID' && t.feeAgorot > 0 && <form action={entryAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="entry" value={e.id} /><input type="hidden" name="op" value="pay" /><input type="hidden" name="amount" value={t.feeAgorot} /><button className="btn small ghost">רישום תשלום</button></form>}
                          {e.status === 'PENDING' && <form action={entryAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="entry" value={e.id} /><input type="hidden" name="op" value="confirm" /><button className="btn small">אישור</button></form>}
                          {e.status === 'PENDING' && <form action={entryAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="entry" value={e.id} /><input type="hidden" name="op" value="confirm" /><input type="hidden" name="override" value="1" /><button className="btn small ghost" title="אישור ידני ללא מסמכים/תשלום">אישור חריג</button></form>}
                          {sugg.has(e.id) && pays.filter((x) => x.entryId === e.id && x.status !== 'REFUNDED')[0] && (
                            <form action={refundAction} className="row">
                              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="payment" value={pays.filter((x) => x.entryId === e.id && x.status !== 'REFUNDED')[0]!.id} />
                              <input name="amount" type="number" step="1" min="0" defaultValue={(sugg.get(e.id)! / 100).toFixed(0)} style={{ width: 80, minHeight: 34 }} title="סכום מוצע לפי מדיניות ההחזרים" />
                              <input name="reason" placeholder="סיבה" required style={{ width: 120, minHeight: 34 }} />
                              <button className="btn small ghost">החזר ₪</button>
                            </form>
                          )}
                          {['PENDING', 'CONFIRMED', 'WAITLIST'].includes(e.status) && <form action={entryAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="entry" value={e.id} /><input type="hidden" name="op" value="withdraw" /><button className="btn small ghost">פרישה</button></form>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {open && (
            <form action={registerAction} className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} />
              <select name="player" required>{(addable.find((x) => x[0] === c.id)?.[1] ?? []).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
              <button className="btn ghost">הוספת שחקן</button>
            </form>
          )}
        </section>
      ))}
      {!cats.length && <div className="card muted">אין קטגוריות. הוסיפו בלשונית סקירה.</div>}
    </>
  );
}

/** The knockout draw as a tree, first round to final, with scores; the viewer's own player (hl) is marked along the way. */
function Bracket({ d, categoryId, hl, tt }: { d: Detail; categoryId: string; hl: Set<string>; tt: (s: string) => string }) {
  const tree = bracketLayout(d.ms.filter((m) => m.categoryId === categoryId && m.stage === 'KO'));
  if (!tree) return null;
  const { cols } = tree;
  const side = (m: (typeof d.ms)[number], e: string | null, mine: (s: { a: number; b: number }) => number) => (
    <div className={[e && m.winnerEntryId === e ? 'w' : '', e && hl.has(e) ? 'me' : ''].join(' ')}>
      <span className="nm">{e ? d.names.get(e) ?? '?' : tt('טרם נקבע')}</span>
      <span className="sc" dir="ltr">{m.status === 'WALKOVER' ? (e && m.winnerEntryId === e ? 'W/O' : '') : ((m.sets ?? []) as { a: number; b: number }[]).map((s, i) => <b key={i}>{mine(s)}</b>)}</span>
    </div>
  );
  return (
    <div className="card tree-card">
      <div className="tree">
        {cols.map((col, k) => {
          const title = roundName(cols.length - 1 - k);
          const box = (m: (typeof col)[number], key: number) => (
            <div key={key} className="tcell">
              {m ? <Link href={`/matches/${m.id}`} className="tm">{side(m, m.aEntryId, (s) => s.a)}{side(m, m.bEntryId, (s) => s.b)}</Link> : <div className={`tm empty ${k ? '' : 'bye'}`} />}
            </div>
          );
          return (
            <div key={k} className="tcol">
              <h3>{title ? tt(title) : `${tt('סיבוב')} ${k + 1}`}</h3>
              <div className="tcells">
                {col.length === 1 ? box(col[0]!, 0) : Array.from({ length: col.length / 2 }, (_, j) => <div key={j} className="tpair">{box(col[2 * j]!, 0)}{box(col[2 * j + 1]!, 1)}</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function DrawTab({ d, manage, hl }: { d: Detail; manage: boolean; hl: Set<string> }) {
  const tt = await tr();
  const { t, cats } = d;
  const canDraw = ['REGISTRATION_CLOSED', 'DRAWN'].includes(t.status);
  return (
    <>
      {manage && !canDraw && t.status !== 'IN_PROGRESS' && t.status !== 'FINISHED' && <div className="card muted">ההגרלה אפשרית אחרי סגירת ההרשמה.</div>}
      {cats.map(async (c) => {
        const dr = d.draws.find((x) => x.categoryId === c.id);
        const fmt = formatOf(c, t);
        const tables = fmt !== 'KNOCKOUT' && dr ? await groupStandings(db, c.id) : [];
        const anyResult = d.ms.some((m) => m.categoryId === c.id && m.status !== 'SCHEDULED');
        if (!manage && !dr?.publishedAt) return <section key={c.id}><h2>{c.name}</h2><div className="card muted">{tt('ההגרלה טרם פורסמה.')}</div></section>;
        const slots = (dr?.slots ?? []) as { entryId: string | null; seed?: number }[];
        return (
          <section key={c.id} className="grid">
            <h2>{c.name} <span className="muted" style={{ fontWeight: 400 }}>· {tt(FORMAT[fmt] ?? '')}</span></h2>
            <Bracket d={d} categoryId={c.id} hl={hl} tt={tt} />
            {manage && canDraw && !anyResult && (
              <form action={drawAction} className="card row">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="run" />
                <label>קוד הגרלה (אופציונלי, לשחזור)<input name="code" type="number" style={{ width: 180 }} /></label>
                <label className="row" style={{ flexDirection: 'row' }}><input type="checkbox" name="clubs" value="1" style={{ minHeight: 0 }} /> הפרדת שחקנים מאותו מועדון</label>
                <button className="btn">{dr ? 'הגרלה מחדש' : 'הגרלה'}</button>
              </form>
            )}
            {manage && dr && <div className="muted">קוד הגרלה {dr.code} · חוקים {dr.ruleSetKey} v{dr.ruleSetVersion} · {dr.publishedAt ? 'פורסמה' : 'טרם פורסמה'}</div>}
            {dr && fmt === 'KNOCKOUT' && (
              <div className="card" style={{ overflow: 'auto' }}>
                <table><thead><tr><th>#</th><th>{tt('שחקן')}</th><th>{tt('זריעה')}</th></tr></thead><tbody>
                  {slots.map((s, i) => <tr key={i}><td>{i + 1}</td><td>{s.entryId ? d.names.get(s.entryId) : <span className="muted">BYE</span>}</td><td>{s.seed ?? ''}</td></tr>)}
                </tbody></table>
              </div>
            )}
            {manage && dr && fmt === 'KNOCKOUT' && !anyResult && (
              <form action={drawAction} className="card row">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="swap" />
                <label>החלפת משבצת<input name="i" type="number" min="1" required style={{ width: 90 }} /></label>
                <label>עם משבצת<input name="j" type="number" min="1" required style={{ width: 90 }} /></label>
                <label>סיבה (חובה)<input name="reason" required /></label>
                <button className="btn ghost">החלפה</button>
              </form>
            )}
            {tables.map((g) => (
              <div key={g.groupId} className="card" style={{ overflow: 'auto' }}>
                {/* group names come from the draw as "בית 1": in English they read "Group 1" */}
                <strong>{tt('שלב הבתים') === 'שלב הבתים' ? g.name : g.name.replace(/^בית(?=\s*\d)/, 'Group')}</strong>
                <table><thead><tr><th>#</th><th>{tt('שחקן')}</th><th>{tt('מש׳')}</th><th>{tt('נצ׳')}</th><th>{tt('הפ׳')}</th><th>{tt('סטים')}</th><th>{tt('גיימים')}</th></tr></thead><tbody>
                  {g.standings.map((s) => <tr key={s.id}><td>{s.rank}</td><td>{d.names.get(s.id)}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.losses}</td><td>{s.setsFor}–{s.setsAgainst}</td><td>{s.gamesFor}–{s.gamesAgainst}</td></tr>)}
                </tbody></table>
              </div>
            ))}
            {manage && dr && fmt === 'GROUPS_KNOCKOUT' && !dr.koSlots && (
              <form action={drawAction} className="row">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="advance" />
                <button className="btn">העלאה לשלב ההדחה</button>
              </form>
            )}
            {manage && dr && (
              <div className="row">
                {!dr.publishedAt && <form action={drawAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="publish" /><button className="btn ghost">פרסום ההגרלה</button></form>}
                {anyResult && <form action={drawAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="points" /><button className="btn ghost">חלוקת נקודות דירוג</button></form>}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

/** Doubles draws mirrored from Loglig: per category the group tables, then every match (group, then knockout) as the match card. */
async function DoublesTab({ d, dc, tab, forId }: { d: Detail; dc: string; tab: string; forId?: string }) {
  const tt = await tr();
  const names = [...new Set(d.doubles.map((m) => m.category))].sort((x, y) => x.localeCompare(y, 'he', { numeric: true }));
  const cat = names.includes(dc) ? dc : names[0];
  const ms = d.doubles.filter((m) => m.category === cat);
  const tables = doublesTables(ms);
  const groupLabel = (g: string) => (tt('שלב הבתים') === 'שלב הבתים' ? g : g.replace(/^בית(?=\s*\d)/, 'Group'));
  const sorted = [...ms].sort((x, y) => (x.stage === y.stage ? 0 : x.stage === 'GROUP' ? -1 : 1) || (x.groupName ?? '').localeCompare(y.groupName ?? '', 'he', { numeric: true }) || +(x.scheduledStart ?? 0) - +(y.scheduledStart ?? 0));
  const href = (c: string) => `/tournaments/${d.t.id}?tab=${tab}&dc=${encodeURIComponent(c)}${forId ? `&for=${forId}` : ''}`;
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>{names.map((c) => <Link key={c} href={href(c)} className={`btn small ${c === cat ? '' : 'ghost'}`}>{c}</Link>)}</div>
      <h2>{cat}</h2>
      {tables.map((g) => (
        <div key={g.group} className="card" style={{ overflow: 'auto' }}>
          <strong>{groupLabel(g.group)}</strong>
          <table><thead><tr><th>#</th><th>{tt('זוג')}</th><th>{tt('מש׳')}</th><th>{tt('נצ׳')}</th><th>{tt('הפ׳')}</th><th>{tt('סטים')}</th><th>{tt('גיימים')}</th></tr></thead><tbody>
            {g.rows.map((r) => <tr key={r.pair}><td>{r.rank}</td><td>{r.pair}</td><td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.setsFor}–{r.setsAgainst}</td><td>{r.gamesFor}–{r.gamesAgainst}</td></tr>)}
          </tbody></table>
        </div>
      ))}
      <div className="grid">
        {sorted.map((m) => (
          <MatchScore key={m.id} aName={m.aName.split(' / ')} bName={m.bName.split(' / ')} sets={m.status === 'SCHEDULED' ? [] : (m.sets as { a: number; b: number }[])} status={m.status}
            winner={m.winner === 'a' || m.winner === 'b' ? m.winner : null}
            caption={[m.stage === 'GROUP' ? groupLabel(m.groupName ?? 'בית 1') : tt('הדחה'), m.court].filter(Boolean).join(' · ')}
            when={m.scheduledStart ? `${m.scheduleKind ? `${m.scheduleKind} ` : ''}${fmtTime(m.scheduledStart)}` : undefined}
            labels={{ walkover: tt('ווק-אובר'), retired: tt('פרישה'), void: tt('בוטל'), live: tt('חי'), won: tt('ניצח') }} />
        ))}
      </div>
    </>
  );
}

async function Results({ d, scorer, hl }: { d: Detail; scorer: boolean; hl: Set<string> }) {
  const tt = await tr();
  const nm = (id: string | null) => (id ? d.names.get(id) ?? '?' : tt('טרם נקבע'));
  return (
    <>
      {d.cats.map((c) => (
        <section key={c.id}>
          <h2>{c.name}</h2>
          <div className="card" style={{ overflow: 'auto' }}>
            <table><thead><tr><th>{tt('שלב')}</th><th>{tt('משחק')}</th><th>{tt('תוצאה')}</th><th>{tt('מגרש / שעה')}</th><th /></tr></thead><tbody>
              {d.ms.filter((m) => m.categoryId === c.id).map((m) => (
                <tr key={m.id} style={(m.aEntryId && hl.has(m.aEntryId)) || (m.bEntryId && hl.has(m.bEntryId)) ? { background: 'var(--limebg, rgba(190,242,100,.18))' } : undefined}>
                  <td>{m.stage === 'GROUP' ? `${tt('שלב הבתים')} · ${tt('מחזור')} ${m.round}` : `${tt('הדחה')} · ${tt('סיבוב')} ${m.round}`}</td>
                  <td colSpan={2} style={{ minWidth: 260 }}>
                    <MatchScore aName={nm(m.aEntryId)} bName={nm(m.bEntryId)} sets={m.status === 'SCHEDULED' ? [] : (m.sets as { a: number; b: number }[])} status={m.status}
                      winner={m.winnerEntryId ? (m.winnerEntryId === m.aEntryId ? 'a' : m.winnerEntryId === m.bEntryId ? 'b' : null) : null}
                      caption={m.status === 'SCHEDULED' ? tt(MSTATUS.SCHEDULED ?? '') : undefined}
                      labels={{ walkover: tt('ווק-אובר'), retired: tt('פרישה'), void: tt('בוטל'), live: tt('חי'), won: tt('ניצח') }} />
                  </td>
                  <td>{m.courtLabel ? `מגרש ${m.courtLabel} · ${fmtTime(m.scheduledStart)}` : '—'}</td>
                  <td>{m.aEntryId && m.bEntryId && <Link className="btn small ghost" href={`/matches/${m.id}`}>{scorer ? (m.status === 'SCHEDULED' ? 'הזנת תוצאה' : 'עריכה') : 'פרטים'}</Link>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
      ))}
    </>
  );
}

async function Schedule({ d, manage }: { d: Detail; manage: boolean }) {
  const tt = await tr();
  const { t } = d;
  const labels = await listCourtLabels(db, t.id);
  const nm = (id: string | null) => (id ? d.names.get(id) ?? '?' : 'טרם נקבע');
  const open = d.ms.filter((m) => m.status === 'SCHEDULED');
  const day = t.startDate.toISOString().slice(0, 10);
  if (!manage) {
    const dated = d.ms.filter((m) => m.scheduledStart && m.aEntryId && m.bEntryId).sort((a, b) => +a.scheduledStart! - +b.scheduledStart!);
    return (
      <div className="card" style={{ overflow: 'auto' }}>
        <Link className="btn small ghost" href={`/tournaments/${t.id}/print`}>{tt('גרסה להדפסה')}</Link>
        <table><thead><tr><th>{tt('שעה')}</th><th>{tt('מגרש')}</th><th>{tt('משחק')}</th><th>{tt('סטטוס')}</th></tr></thead><tbody>
          {dated.map((m) => <tr key={m.id}><td>{fmtTime(m.scheduledStart)}</td><td>{m.courtLabel ?? '—'}</td><td><Link href={`/matches/${m.id}`}>{nm(m.aEntryId)} – {nm(m.bEntryId)}</Link></td><td>{tt(MSTATUS[m.status] ?? '')}</td></tr>)}
        </tbody></table>
        {!dated.length && <p className="muted">{tt('הלוח טרם פורסם.')}</p>}
      </div>
    );
  }
  return (
    <>
      <Link className="btn small ghost" href={`/tournaments/${t.id}/print`}>גרסה להדפסה של הלוח</Link>
      <h2>מגרשי התחרות</h2>
      <form action={courtsAction} className="card row">
        <input type="hidden" name="id" value={t.id} />
        <label style={{ flex: 1 }}>מזהי מגרשים (מופרדים בפסיק)<input name="labels" defaultValue={labels.join(', ')} required /></label>
        <button className="btn">שמירה</button>
      </form>
      <h2>שיבוץ אוטומטי</h2>
      <form action={autoScheduleAction} className="card row">
        <input type="hidden" name="id" value={t.id} />
        <label>יום ראשון<input name="day" type="date" defaultValue={day} required /></label>
        <label>שעת התחלה<input name="from" type="time" defaultValue="09:00" /></label>
        <label>ימי משחק<input name="days" type="number" min="1" defaultValue="2" style={{ width: 90 }} /></label>
        <label>שעות ביום<input name="hours" type="number" min="1" defaultValue="10" style={{ width: 90 }} /></label>
        <label>מנוחה (דק׳)<input name="rest" type="number" min="0" defaultValue="30" style={{ width: 90 }} /></label>
        <button className="btn">שיבוץ</button>
      </form>
      <h2>שיבוץ ידני</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>משחק</th><th>כעת</th><th>שעה מדויקת / לא לפני</th></tr></thead><tbody>
          {open.map((m) => (
            <tr key={m.id}>
              <td>{nm(m.aEntryId)} – {nm(m.bEntryId)}</td>
              <td>{m.courtLabel ? `מגרש ${m.courtLabel} · ${fmtTime(m.scheduledStart)}${m.scheduleKind === 'EXACT' ? ' (קבוע)' : ''}` : m.notBefore ? `לא לפני ${fmtTime(m.notBefore)}` : '—'}</td>
              <td>
                <form action={slotAction} className="row">
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="match" value={m.id} />
                  <select name="kind"><option value="EXACT">שעה מדויקת</option><option value="NOT_BEFORE">לא לפני</option><option value="CLEAR">ניקוי</option></select>
                  <select name="court">{labels.map((l) => <option key={l} value={l}>מגרש {l}</option>)}</select>
                  <input name="when" type="datetime-local" />
                  <button className="btn small ghost">עדכון</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
      {!open.length && <div className="card muted">אין משחקים פתוחים לשיבוץ.</div>}
          </>
  );
}
