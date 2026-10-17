import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { ENTRY_STATUS, PAY_STATUS } from '@/components/labels';
import { requireActor } from '@/lib/session';
import { ownedPlayerIds, checkDocuments } from '@/services/entries';
import { inbox } from '@/services/notifications';
import { signedUrl } from '@/lib/storage';
import { payAction } from '@/app/actions3';
import { addPlayerAction, cancelEntryAction, childLoginAction, removeProfileAction, updateProfileAction, selfRegisterAction, suggestEntryAction, uploadDocAction } from '@/app/actions2';
import { childLoginName, isChildActor } from '@/services/children';
import { ineligibleReason } from '@/services/eligibility';
import { claimPlayerAction } from '@/app/actions9';

const DOC: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };
const DS: Record<string, string> = { PENDING: 'ממתין לאישור', APPROVED: 'אושר', REJECTED: 'נדחה', EXPIRED: 'פג תוקף' };

export default async function Me({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; who?: string }> }) {
  const { err, ok, who } = await searchParams;
  const actor = await requireActor();
  const isChild = await isChildActor(db, actor);
  const ids = await ownedPlayerIds(db, actor);
  const ps = ids.length ? await db.select().from(schema.players).where(inArray(schema.players.id, ids)) : [];
  const docs = ids.length ? await db.select().from(schema.documents).where(inArray(schema.documents.playerId, ids)) : [];
  const ents = ids.length ? await db.select({ e: schema.entries, c: schema.categories, t: schema.tournaments }).from(schema.entries)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.entries.categoryId)).innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId))
    .where(inArray(schema.entries.playerId, ids)) : [];
  const open = await db.select({ c: schema.categories, t: schema.tournaments }).from(schema.categories)
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId)).where(eq(schema.tournaments.status, 'REGISTRATION_OPEN'));
  const notes = await inbox(db, actor.id);
  const pendingClaims = await db.select().from(schema.claimRequests).where(and(eq(schema.claimRequests.userId, actor.id), eq(schema.claimRequests.status, 'PENDING')));
  const loginNames = new Map(await Promise.all(ps.filter((p) => p.accountId !== actor.id).map(async (p) => [p.id, await childLoginName(db, p.id)] as const)));
  const checks = new Map(await Promise.all(ps.map(async (p) => [p.id, await checkDocuments(db, p.id, new Date())] as const)));
  return (
    <Shell nav="me">
      <h1>האזור האישי</h1>
      <Flash err={err} ok={ok} />
      {ps.length === 0 && (
        <div className="card grid" style={{ gap: 10, marginBottom: 14 }}>
          <strong style={{ fontSize: 18 }}>ברוכים הבאים</strong>
          <span className="muted">כאן מנהלים הרשמות לתחרויות. מה תרצו לעשות?</span>
          <div className="row">
            <a className="btn" href="/welcome">להירשם לתחרות: הוספת שחקן או ילד</a>
            <a className="btn ghost" href="/following">לעקוב אחרי שחקנים ולקבל תוצאות</a>
            <a className="btn ghost" href="/">לצפות בתחרויות</a>
          </div>
        </div>
      )}
      {ps.map((p) => (
        <section key={p.id} className="card grid" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 18 }}>{p.firstName} {p.lastName}</strong>
            <span className={`pill ${checks.get(p.id)?.ok ? 'ok' : 'warn'}`}>{checks.get(p.id)?.ok ? 'כל המסמכים תקינים' : `חסר: ${checks.get(p.id)?.missing.map((m) => DOC[m]).join(', ')}`}</span>
          </div>
          {docs.filter((d) => d.playerId === p.id).map((d) => (
            <div key={d.id} className="row"><span>{DOC[d.type]}</span><span className={`pill ${d.status === 'APPROVED' ? 'ok' : d.status === 'REJECTED' ? 'bad' : 'warn'}`}>{DS[d.status]}</span>{d.reviewNote && <span className="muted">{d.reviewNote}</span>}<a className="muted" href={signedUrl(d.storageKey)} target="_blank">צפייה</a></div>
          ))}
          {!isChild && (
          <form action={uploadDocAction} className="row">
            <input type="hidden" name="player" value={p.id} />
            <select name="type">{Object.entries(DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required />
            <label style={{ flexDirection: 'row', alignItems: 'center' }}>תוקף<input name="expires" type="date" /></label>
            <button className="btn small">העלאה</button>
          </form>
          )}
          {open.length > 0 && (
            <form action={isChild ? suggestEntryAction : selfRegisterAction} className="row">
              <input type="hidden" name="player" value={p.id} />
              <select name="category">{open.filter((o) => !ineligibleReason(p, o.c, o.t)).map((o) => <option key={o.c.id} value={o.c.id}>{o.t.name} · {o.c.name}</option>)}</select>
              <button className="btn small ghost">{isChild ? 'הצעה להורה להירשם' : 'הרשמה לתחרות'}</button>
            </form>
          )}
          {!isChild && (
            <details className="filters" style={{ marginTop: 0 }}>
              <summary>עריכת פרטים</summary>
              <form action={updateProfileAction} className="row" style={{ marginTop: 8 }}>
                <input type="hidden" name="player" value={p.id} />
                <label>שם פרטי<input name="first" defaultValue={p.firstName} required /></label>
                <label>שם משפחה<input name="last" defaultValue={p.lastName} required /></label>
                <label>תאריך לידה<input name="birth" type="date" defaultValue={p.birthDate.toISOString().slice(0, 10)} required /></label>
                <label>מין<select name="gender" defaultValue={p.gender}><option value="MALE">זכר</option><option value="FEMALE">נקבה</option></select></label>
                <button className="btn small">שמירה</button>
              </form>
              <form action={removeProfileAction} className="row" style={{ marginTop: 8 }}>
                <input type="hidden" name="player" value={p.id} />
                <label style={{ flexDirection: 'row', alignItems: 'center', fontWeight: 500 }}><input type="checkbox" required style={{ minHeight: 0 }} /> אני מאשר/ת להסיר את {p.firstName} מהחשבון</label>
                <button className="btn small ghost" style={{ color: 'var(--bad)' }}>מחיקת פרופיל</button>
                <span className="muted">פרופיל בלי הרשמות ותוצאות נמחק לגמרי. אם יש היסטוריה, הוא מוסר מהחשבון ונשאר ברשומות האיגוד.</span>
              </form>
            </details>
          )}
          {!isChild && p.accountId !== actor.id && (
            <form action={childLoginAction} className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <input type="hidden" name="player" value={p.id} />
              <strong>{loginNames.get(p.id) ? `כניסה לילד/ה: ${loginNames.get(p.id)}` : 'כניסה לילד/ה'}</strong>
              <label>שם משתמש<input name="username" defaultValue={loginNames.get(p.id) ?? ''} required pattern="[A-Za-z0-9._]{3,20}" autoCapitalize="none" /></label>
              <label>סיסמה<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
              <button className="btn small ghost">{loginNames.get(p.id) ? 'עדכון סיסמה' : 'יצירת כניסה'}</button>
            </form>
          )}
        </section>
      ))}
      <h2>הרשמות שלי</h2>
      {(() => {
        const live = ents.filter(({ e }) => e.status !== 'WITHDRAWN' && e.status !== 'REJECTED');
        const gone = ents.filter(({ e }) => e.status === 'WITHDRAWN' || e.status === 'REJECTED');
        const who = (id: string) => { const q = ps.find((x) => x.id === id); return q ? `${q.firstName} ${q.lastName}` : ''; };
        return (
          <>
            <div className="card grid" style={{ gap: 12 }}>
              {live.length ? live.map(({ e, c, t }) => (
                <div key={e.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{t.name}</strong>
                    <div className="muted">{who(e.playerId)} · {c.name}</div>
                  </div>
                  <div className="row">
                    <span className={`pill ${ENTRY_STATUS[e.status]?.[1] ?? ''}`}>{ENTRY_STATUS[e.status]?.[0] ?? e.status}</span>
                    <span className={`pill ${PAY_STATUS[e.paymentStatus]?.[1] ?? ''}`}>{PAY_STATUS[e.paymentStatus]?.[0] ?? e.paymentStatus}</span>
                    {!isChild && e.paymentStatus === 'UNPAID' && t.feeAgorot > 0 && <form action={payAction}><input type="hidden" name="entry" value={e.id} /><button className="btn small">תשלום ₪{(t.feeAgorot / 100).toFixed(0)}</button></form>}
                    {!isChild && e.paymentStatus === 'UNPAID' && <form action={cancelEntryAction}><input type="hidden" name="entry" value={e.id} /><button className="btn small ghost" style={{ color: 'var(--bad)' }}>ביטול הרשמה</button></form>}
                  </div>
                </div>
              )) : <span className="muted">אין הרשמות פעילות.</span>}
            </div>
            {gone.length > 0 && (
              <details className="filters">
                <summary>הרשמות שבוטלו ({gone.length})</summary>
                <div className="card grid" style={{ marginTop: 8 }}>
                  {gone.map(({ e, c, t }) => <div key={e.id} className="row"><strong>{t.name}</strong><span className="muted">{who(e.playerId)} · {c.name}</span><span className={`pill ${ENTRY_STATUS[e.status]?.[1] ?? ''}`}>{ENTRY_STATUS[e.status]?.[0] ?? e.status}</span></div>)}
                </div>
              </details>
            )}
          </>
        );
      })()}
      {!isChild && (<>
      <h2 id="add-player">{ps.length ? 'הוספת שחקן או ילד נוסף' : 'הוספת שחקן'}</h2>
      {ps.length === 0 && <p className="muted" style={{ margin: '0 0 8px' }}>כדי להירשם לתחרות צריך קודם פרופיל שחקן: שלכם, או של ילד/ה שאתם מלווים. התעודה נשמרת מוצפנת.</p>}
      <form action={addPlayerAction} className="card row">
        <label>שם פרטי<input name="first" required /></label><label>שם משפחה<input name="last" required /></label>
        <label>תאריך לידה<input name="birth" type="date" required /></label>
        <label>מין<select name="gender"><option value="MALE">זכר</option><option value="FEMALE">נקבה</option></select></label>
        <label>ת״ז (נשמר כמזהה מוצפן בלבד)<input name="nid" inputMode="numeric" /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="child" value="1" defaultChecked={who === 'child'} style={{ minHeight: 0 }} /> זה ילד/ה שלי</label>
        <button className="btn">הוספה</button>
      </form>
      <h2 id="claim-player">אני כבר רשום באיגוד</h2>
      <p className="muted" style={{ margin: '0 0 8px' }}>אם אתם או ילדכם כבר מופיעים במערכת (למשל מתחרויות קודמות), שייכו את הפרופיל הקיים לחשבון. עם ת״ז ותאריך לידה תואמים השיוך מיידי, אחרת הבקשה עוברת לאישור האיגוד.</p>
      {pendingClaims.map((c) => <div key={c.id} className="card row"><strong>{c.firstName} {c.lastName}</strong><span className="pill warn">ממתין לאישור האיגוד</span></div>)}
      <form action={claimPlayerAction} className="card row">
        <label>שם פרטי<input name="first" required /></label><label>שם משפחה<input name="last" required /></label>
        <label>תאריך לידה<input name="birth" type="date" required /></label>
        <label>ת״ז (נשמר כמזהה מוצפן בלבד)<input name="nid" inputMode="numeric" /></label>
        <label>הערה לאיגוד<input name="reason" /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="child" value="1" style={{ minHeight: 0 }} /> זה ילד/ה שלי</label>
        <button className="btn">שיוך שחקן קיים</button>
      </form>
      </>)}
      <form action="/logout?all=1" method="post" style={{ marginTop: 24 }}>
        <button className="btn ghost small">התנתקות מכל המכשירים</button>
        <span className="muted"> {' '}מנתק את החשבון בכל הטלפונים והדפדפנים, למשל אם אבד מכשיר</span>
      </form>
      <h2>התראות</h2>
      <div className="card grid">{notes.length ? notes.slice().reverse().slice(0, 20).map((n) => <div key={n.id}><strong>{n.title}</strong> <span className="muted">{n.body}</span></div>) : <span className="muted">אין התראות.</span>}</div>
    </Shell>
  );
}
