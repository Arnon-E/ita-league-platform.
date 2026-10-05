import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { ownedPlayerIds, checkDocuments } from '@/services/entries';
import { inbox } from '@/services/notifications';
import { signedUrl } from '@/lib/storage';
import { payAction } from '@/app/actions3';
import { addPlayerAction, selfRegisterAction, uploadDocAction } from '@/app/actions2';

const DOC: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };
const DS: Record<string, string> = { PENDING: 'ממתין לאישור', APPROVED: 'אושר', REJECTED: 'נדחה', EXPIRED: 'פג תוקף' };

export default async function Me({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const actor = await requireActor();
  const ids = await ownedPlayerIds(db, actor);
  const ps = ids.length ? await db.select().from(schema.players).where(inArray(schema.players.id, ids)) : [];
  const docs = ids.length ? await db.select().from(schema.documents).where(inArray(schema.documents.playerId, ids)) : [];
  const ents = ids.length ? await db.select({ e: schema.entries, c: schema.categories, t: schema.tournaments }).from(schema.entries)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.entries.categoryId)).innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId))
    .where(inArray(schema.entries.playerId, ids)) : [];
  const open = await db.select({ c: schema.categories, t: schema.tournaments }).from(schema.categories)
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId)).where(eq(schema.tournaments.status, 'REGISTRATION_OPEN'));
  const notes = await inbox(db, actor.id);
  const checks = new Map(await Promise.all(ps.map(async (p) => [p.id, await checkDocuments(db, p.id, new Date())] as const)));
  return (
    <Shell nav="me">
      <h1>האזור האישי</h1>
      <Flash err={err} ok={ok} />
      {ps.map((p) => (
        <section key={p.id} className="card grid" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 18 }}>{p.firstName} {p.lastName}</strong>
            <span className={`pill ${checks.get(p.id)?.ok ? 'ok' : 'warn'}`}>{checks.get(p.id)?.ok ? 'כל המסמכים תקינים' : `חסר: ${checks.get(p.id)?.missing.map((m) => DOC[m]).join(', ')}`}</span>
          </div>
          {docs.filter((d) => d.playerId === p.id).map((d) => (
            <div key={d.id} className="row"><span>{DOC[d.type]}</span><span className={`pill ${d.status === 'APPROVED' ? 'ok' : d.status === 'REJECTED' ? 'bad' : 'warn'}`}>{DS[d.status]}</span>{d.reviewNote && <span className="muted">{d.reviewNote}</span>}<a className="muted" href={signedUrl(d.storageKey)} target="_blank">צפייה</a></div>
          ))}
          <form action={uploadDocAction} className="row">
            <input type="hidden" name="player" value={p.id} />
            <select name="type">{Object.entries(DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required />
            <label style={{ flexDirection: 'row', alignItems: 'center' }}>תוקף<input name="expires" type="date" /></label>
            <button className="btn small">העלאה</button>
          </form>
          {open.length > 0 && (
            <form action={selfRegisterAction} className="row">
              <input type="hidden" name="player" value={p.id} />
              <select name="category">{open.filter((o) => o.c.gender === 'OPEN' || o.c.gender === p.gender).map((o) => <option key={o.c.id} value={o.c.id}>{o.t.name} · {o.c.name}</option>)}</select>
              <button className="btn small ghost">הרשמה לתחרות</button>
            </form>
          )}
        </section>
      ))}
      <h2>הרשמות שלי</h2>
      <div className="card">{ents.length ? ents.map(({ e, c, t }) => <div key={e.id} className="row"><strong>{t.name}</strong><span className="muted">{c.name}</span><span className="pill">{e.status}</span><span className="pill">{e.paymentStatus}</span>{e.paymentStatus === 'UNPAID' && t.feeAgorot > 0 && <form action={payAction}><input type="hidden" name="entry" value={e.id} /><button className="btn small">תשלום ₪{(t.feeAgorot / 100).toFixed(0)}</button></form>}</div>) : <span className="muted">אין הרשמות.</span>}</div>
      <h2>הוספת שחקן</h2>
      <form action={addPlayerAction} className="card row">
        <label>שם פרטי<input name="first" required /></label><label>שם משפחה<input name="last" required /></label>
        <label>תאריך לידה<input name="birth" type="date" required /></label>
        <label>מין<select name="gender"><option value="MALE">זכר</option><option value="FEMALE">נקבה</option></select></label>
        <label>ת״ז (נשמר כמזהה מוצפן בלבד)<input name="nid" inputMode="numeric" /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" name="child" value="1" style={{ minHeight: 0 }} /> זה ילד/ה שלי</label>
        <button className="btn">הוספה</button>
      </form>
      <h2>התראות</h2>
      <div className="card grid">{notes.length ? notes.slice().reverse().slice(0, 20).map((n) => <div key={n.id}><strong>{n.title}</strong> <span className="muted">{n.body}</span></div>) : <span className="muted">אין התראות.</span>}</div>
    </Shell>
  );
}
