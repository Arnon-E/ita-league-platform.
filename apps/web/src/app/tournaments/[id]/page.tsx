import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, schema } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { tournamentDetail, playersNotIn } from '@/services/queries';
import { groupStandings } from '@/services/results';
import { listCourtLabels } from '@/services/tournaments';
import { formatOf } from '@/services/draws';
import { loadRuleSet } from '@/services/rules';
import { FORMAT, fmtTime, GENDER, MSTATUS, NEXT, STATUS } from '@/components/labels';
import { refundAction } from '@/app/actions3';
import { suggestedRefund } from '@/services/payments';
import {
  autoScheduleAction, categoryAction, courtsAction, drawAction, entryAction, registerAction, slotAction, statusAction,
} from '@/app/actions';

type Detail = NonNullable<Awaited<ReturnType<typeof tournamentDetail>>>;
const TABS: [string, string][] = [['overview', 'סקירה'], ['entries', 'משתתפים'], ['draw', 'הגרלה'], ['results', 'משחקים ותוצאות'], ['schedule', 'לוח ומגרשים']];

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; err?: string; ok?: string }> }) {
  const { id } = await params;
  const { tab = 'overview', err, ok } = await searchParams;
  const d = await tournamentDetail(db, id);
  if (!d) notFound();
  const { t } = d;
  const rulesVerified = (await loadRuleSet(db, t.ruleSetId)).verified;
  const [st, cls] = STATUS[t.status] ?? [t.status, ''];
  return (
    <Shell nav="home">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>{t.name}</h1><span className="muted">{t.startDate.toLocaleDateString('he-IL')} – {t.endDate.toLocaleDateString('he-IL')} · {FORMAT[t.format]}</span></div>
        <span className={`pill ${cls}`}>{st}</span>
      </div>
      <nav className="tabs">{TABS.map(([k, l]) => <Link key={k} href={`/tournaments/${id}?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</nav>
      <Flash err={err} ok={ok} />
      {!rulesVerified && <div className="err" style={{ background: 'var(--warnbg)', color: 'var(--warn)' }}>ערכת החוקים של התחרות טרם אומתה מול תקנוני האיגוד. ההגרלה והנקודות עשויות לא להתאים לתקנון.</div>}
      {tab === 'overview' && <Overview d={d} />}
      {tab === 'entries' && <Entries d={d} />}
      {tab === 'draw' && <DrawTab d={d} />}
      {tab === 'results' && <Results d={d} />}
      {tab === 'schedule' && <Schedule d={d} />}
    </Shell>
  );
}

function Overview({ d }: { d: Detail }) {
  const { t, cats, ents } = d;
  return (
    <>
      <div className="card row">
        {(NEXT[t.status] ?? []).map(([to, label]) => (
          <form key={to} action={statusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="to" value={to} /><button className="btn">{label}</button></form>
        ))}
        {t.status !== 'CANCELLED' && t.status !== 'FINISHED' && (
          <form action={statusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="to" value="CANCELLED" /><button className="btn ghost">ביטול תחרות</button></form>
        )}
        <span className="muted">דמי השתתפות: ₪{(t.feeAgorot / 100).toFixed(0)}</span>
      </div>
      <h2>קטגוריות</h2>
      <div className="grid cols">
        {cats.map((c) => (
          <div key={c.id} className="card grid" style={{ gap: 4 }}>
            <strong>{c.name}</strong>
            <span className="muted">{GENDER[c.gender]} · {FORMAT[formatOf(c, t)]}{c.capacity ? ` · עד ${c.capacity}` : ''}</span>
            <span className="muted">{ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'CONFIRMED').length} מאושרים · {ents.filter((x) => x.e.categoryId === c.id && x.e.status === 'PENDING').length} ממתינים</span>
          </div>
        ))}
      </div>
      <h2>הוספת קטגוריה</h2>
      <form action={categoryAction} className="card row">
        <input type="hidden" name="id" value={t.id} />
        <label>שם<input name="name" required /></label>
        <label>מין<select name="gender">{Object.entries(GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>פורמט<select name="format"><option value="">כברירת מחדל</option>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>מקסימום משתתפים<input name="capacity" type="number" min="2" style={{ width: 120 }} /></label>
        <label>גודל בית<input name="groupSize" type="number" min="3" defaultValue="4" style={{ width: 90 }} /></label>
        <label>עולים מכל בית<input name="advancers" type="number" min="1" defaultValue="2" style={{ width: 90 }} /></label>
        <button className="btn">הוספה</button>
      </form>
    </>
  );
}

async function Entries({ d }: { d: Detail }) {
  const { t, cats, ents } = d;
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

function Bracket({ d, categoryId, slotsKey }: { d: Detail; categoryId: string; slotsKey?: 'slots' | 'koSlots' }) {
  const ms = d.ms.filter((m) => m.categoryId === categoryId && m.stage === 'KO');
  if (!ms.length) return null;
  const rounds = Math.max(...ms.map((m) => m.round));
  const nm = (id: string | null) => (id ? d.names.get(id) ?? '?' : '—');
  void slotsKey;
  return (
    <div className="bracket">
      {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
        <div key={r} className="round">
          <strong className="muted">{['גמר', 'חצי גמר', 'רבע גמר'][rounds - r] ?? `סיבוב ${r}`}</strong>
          {ms.filter((m) => m.round === r).map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="m">
              <div className={m.winnerEntryId && m.winnerEntryId === m.aEntryId ? 'w' : ''}><span>{nm(m.aEntryId)}</span></div>
              <div className={m.winnerEntryId && m.winnerEntryId === m.bEntryId ? 'w' : ''}><span>{nm(m.bEntryId)}</span></div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

async function DrawTab({ d }: { d: Detail }) {
  const { t, cats } = d;
  const canDraw = ['REGISTRATION_CLOSED', 'DRAWN'].includes(t.status);
  return (
    <>
      {!canDraw && t.status !== 'IN_PROGRESS' && t.status !== 'FINISHED' && <div className="card muted">ההגרלה אפשרית אחרי סגירת ההרשמה.</div>}
      {cats.map(async (c) => {
        const dr = d.draws.find((x) => x.categoryId === c.id);
        const fmt = formatOf(c, t);
        const tables = fmt !== 'KNOCKOUT' && dr ? await groupStandings(db, c.id) : [];
        const anyResult = d.ms.some((m) => m.categoryId === c.id && m.status !== 'SCHEDULED');
        const slots = (dr?.slots ?? []) as { entryId: string | null; seed?: number }[];
        return (
          <section key={c.id} className="grid">
            <h2>{c.name} <span className="muted" style={{ fontWeight: 400 }}>· {FORMAT[fmt]}</span></h2>
            {canDraw && !anyResult && (
              <form action={drawAction} className="card row">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="run" />
                <label>קוד הגרלה (אופציונלי, לשחזור)<input name="code" type="number" style={{ width: 180 }} /></label>
                <label className="row" style={{ flexDirection: 'row' }}><input type="checkbox" name="clubs" value="1" style={{ minHeight: 0 }} /> הפרדת שחקנים מאותו מועדון</label>
                <button className="btn">{dr ? 'הגרלה מחדש' : 'הגרלה'}</button>
              </form>
            )}
            {dr && <div className="muted">קוד הגרלה {dr.code} · חוקים {dr.ruleSetKey} v{dr.ruleSetVersion} · {dr.publishedAt ? 'פורסמה' : 'טרם פורסמה'}</div>}
            {dr && fmt === 'KNOCKOUT' && (
              <div className="card" style={{ overflow: 'auto' }}>
                <table><thead><tr><th>#</th><th>שחקן</th><th>זריעה</th></tr></thead><tbody>
                  {slots.map((s, i) => <tr key={i}><td>{i + 1}</td><td>{s.entryId ? d.names.get(s.entryId) : <span className="muted">BYE</span>}</td><td>{s.seed ?? ''}</td></tr>)}
                </tbody></table>
              </div>
            )}
            {dr && fmt === 'KNOCKOUT' && !anyResult && (
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
                <strong>{g.name}</strong>
                <table><thead><tr><th>#</th><th>שחקן</th><th>מש׳</th><th>נצ׳</th><th>הפ׳</th><th>סטים</th><th>גיימים</th></tr></thead><tbody>
                  {g.standings.map((s) => <tr key={s.id}><td>{s.rank}</td><td>{d.names.get(s.id)}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.losses}</td><td>{s.setsFor}–{s.setsAgainst}</td><td>{s.gamesFor}–{s.gamesAgainst}</td></tr>)}
                </tbody></table>
              </div>
            ))}
            {dr && fmt === 'GROUPS_KNOCKOUT' && !dr.koSlots && (
              <form action={drawAction} className="row">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="category" value={c.id} /><input type="hidden" name="op" value="advance" />
                <button className="btn">העלאה לשלב ההדחה</button>
              </form>
            )}
            <Bracket d={d} categoryId={c.id} />
            {dr && (
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

function Results({ d }: { d: Detail }) {
  const nm = (id: string | null) => (id ? d.names.get(id) ?? '?' : 'טרם נקבע');
  return (
    <>
      {d.cats.map((c) => (
        <section key={c.id}>
          <h2>{c.name}</h2>
          <div className="card" style={{ overflow: 'auto' }}>
            <table><thead><tr><th>שלב</th><th>משחק</th><th>תוצאה</th><th>מגרש / שעה</th><th /></tr></thead><tbody>
              {d.ms.filter((m) => m.categoryId === c.id).map((m) => (
                <tr key={m.id}>
                  <td>{m.stage === 'GROUP' ? `בית · מחזור ${m.round}` : `הדחה · סיבוב ${m.round}`}</td>
                  <td>{nm(m.aEntryId)} – {nm(m.bEntryId)}</td>
                  <td>{m.status === 'SCHEDULED' ? <span className="pill warn">{MSTATUS[m.status]}</span> : <span className="pill ok">{MSTATUS[m.status]}{m.status === 'COMPLETED' ? ` ${(m.sets as { a: number; b: number }[]).map((s) => `${s.a}-${s.b}`).join(' ')}` : ''}</span>}</td>
                  <td>{m.courtLabel ? `מגרש ${m.courtLabel} · ${fmtTime(m.scheduledStart)}` : '—'}</td>
                  <td>{m.aEntryId && m.bEntryId && <Link className="btn small ghost" href={`/matches/${m.id}`}>{m.status === 'SCHEDULED' ? 'הזנת תוצאה' : 'עריכה'}</Link>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
      ))}
    </>
  );
}

async function Schedule({ d }: { d: Detail }) {
  const { t } = d;
  const labels = await listCourtLabels(db, t.id);
  const nm = (id: string | null) => (id ? d.names.get(id) ?? '?' : 'טרם נקבע');
  const open = d.ms.filter((m) => m.status === 'SCHEDULED');
  const day = t.startDate.toISOString().slice(0, 10);
  return (
    <>
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
