import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tournamentDetail } from '@/services/queries';
import { fmtTime, MSTATUS } from '@/components/labels';
import { PrintButton } from './PrintButton';

/** Day-by-day schedule laid out for printing (header and buttons are hidden by the print stylesheet). */
export default async function PrintSchedule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await tournamentDetail(db, id);
  if (!d) notFound();
  const nm = (x: string | null) => (x ? d.names.get(x) ?? '?' : 'טרם נקבע');
  const cat = new Map(d.cats.map((c) => [c.id, c.name]));
  const dated = d.ms.filter((m) => m.scheduledStart).sort((a, b) => +a.scheduledStart! - +b.scheduledStart! || (a.courtLabel ?? '').localeCompare(b.courtLabel ?? ''));
  const days = new Map<string, typeof dated>();
  for (const m of dated) {
    const k = m.scheduledStart!.toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    days.set(k, [...(days.get(k) ?? []), m]);
  }
  return (
    <Shell nav="home">
      <div className="row noprint" style={{ justifyContent: 'space-between' }}>
        <Link href={`/tournaments/${id}?tab=schedule`} className="muted">← חזרה לתחרות</Link>
        <PrintButton />
      </div>
      <h1>{d.t.name} · לוח משחקים</h1>
      {[...days].map(([day, ms]) => (
        <section key={day} style={{ breakInside: 'avoid' }}>
          <h2>{day}</h2>
          <table><thead><tr><th>שעה</th><th>מגרש</th><th>קטגוריה</th><th>משחק</th><th>תוצאה</th></tr></thead><tbody>
            {ms.map((m) => (
              <tr key={m.id}>
                <td>{fmtTime(m.scheduledStart).split(',').pop()}</td><td>{m.courtLabel ?? '—'}</td><td>{cat.get(m.categoryId)}</td>
                <td>{nm(m.aEntryId)} – {nm(m.bEntryId)}</td>
                <td>{m.status === 'SCHEDULED' ? '' : `${MSTATUS[m.status]} ${(m.sets as { a: number; b: number }[]).map((s) => `${s.a}-${s.b}`).join(' ')}`}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      ))}
      {!dated.length && <div className="card muted">הלוח טרם פורסם.</div>}
    </Shell>
  );
}
