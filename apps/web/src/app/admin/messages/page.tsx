import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, schema } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { can } from '@/lib/permissions';
import { requireActor } from '@/lib/session';
import { broadcastAction } from '@/app/actions5';

export default async function Messages({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  const a = await requireActor();
  if (!can(a, 'notification.send')) redirect('/');
  const [clubs, ts] = await Promise.all([
    db.select().from(schema.clubs).orderBy(asc(schema.clubs.name)),
    db.select().from(schema.tournaments).orderBy(asc(schema.tournaments.name)),
  ]);
  return (
    <Shell nav="messages">
      <h1>הודעות</h1>
      <p className="muted">שליחת הודעה מרוכזת. ההודעה מגיעה כהתראת פוש ובאימייל, בהתאם להעדפות כל משתמש. הורים מקבלים הודעות עבור ילדיהם.</p>
      <Flash err={err} ok={ok} />
      <form action={broadcastAction} className="card grid" style={{ maxWidth: 640, marginTop: 14 }}>
        <label>נמענים
          <select name="audience" defaultValue="ALL">
            <option value="ALL">כל המשתמשים</option>
            <option value="CLUB">שחקני מועדון</option>
            <option value="TOURNAMENT">משתתפי תחרות</option>
          </select>
        </label>
        <label>מועדון (אם נבחר מועדון)<select name="club"><option value="">—</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>תחרות (אם נבחרה תחרות)<select name="tournament"><option value="">—</option>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>כותרת<input name="title" maxLength={120} required /></label>
        <label>תוכן<textarea name="body" rows={5} maxLength={2000} required style={{ padding: 12, minHeight: 120 }} /></label>
        <button className="btn">שליחה</button>
      </form>
    </Shell>
  );
}
