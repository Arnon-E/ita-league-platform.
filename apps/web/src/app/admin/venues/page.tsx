import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { can } from '@/lib/permissions';
import { requireActor } from '@/lib/session';
import { courtsForVenueAction, deleteVenueAction, venueAction } from '@/app/actions4';

export default async function Venues({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const a = await requireActor();
  if (!can(a, 'courts.manage')) redirect('/');
  const venues = await db.select().from(schema.venues).orderBy(asc(schema.venues.name));
  const courts = await db.select().from(schema.courts).orderBy(asc(schema.courts.name));
  return (
    <Shell nav="venues">
      <h1>מתקנים ומגרשים</h1>
      <Flash err={err} ok={ok} />
      <form action={venueAction} className="card row" style={{ margin: '12px 0' }}>
        <label>שם המתקן<input name="name" required /></label>
        <label>עיר<input name="city" /></label>
        <button className="btn">הוספת מתקן</button>
      </form>
      <div className="grid cols">
        {venues.map((v) => (
          <div key={v.id} className="card grid" style={{ gap: 8 }}>
            <strong style={{ fontSize: 17 }}>{v.name}</strong><span className="muted">{v.city ?? ''}</span>
            <div className="row">{courts.filter((c) => c.venueId === v.id).map((c) => <span key={c.id} className="pill">{c.name}</span>)}</div>
            <form action={courtsForVenueAction} className="row">
              <input type="hidden" name="venue" value={v.id} />
              <input name="names" placeholder="מגרשים: 1, 2, 3" required style={{ flex: 1, minWidth: 120 }} />
              <button className="btn small ghost">הוספה</button>
            </form>
            <form action={deleteVenueAction}><input type="hidden" name="venue" value={v.id} /><button className="btn small ghost">מחיקת מתקן</button></form>
          </div>
        ))}
        {!venues.length && <div className="card muted">אין עדיין מתקנים.</div>}
      </div>
    </Shell>
  );
}
