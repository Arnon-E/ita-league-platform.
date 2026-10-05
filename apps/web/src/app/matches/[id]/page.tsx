import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { matchDetail } from '@/services/queries';
import { fmtTime, MSTATUS } from '@/components/labels';
import { ScoreForm } from './ScoreForm';

export default async function MatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { id } = await params;
  const { err, ok } = await searchParams;
  const d = await matchDetail(db, id);
  if (!d) notFound();
  const { m, c, t, names } = d;
  const A = m.aEntryId ? names.get(m.aEntryId) ?? '?' : null;
  const B = m.bEntryId ? names.get(m.bEntryId) ?? '?' : null;
  return (
    <Shell nav="home">
      <Link href={`/tournaments/${t.id}?tab=results`} className="muted">← חזרה לתחרות</Link>
      <h1>{c.name} · {m.stage === 'GROUP' ? `בית, מחזור ${m.round}` : `הדחה, סיבוב ${m.round}`}</h1>
      <p className="muted">{m.courtLabel ? `מגרש ${m.courtLabel} · ${fmtTime(m.scheduledStart)} · ` : ''}{t.setsToWin === 2 ? 'הטוב מ-3 סטים' : `${t.setsToWin} סטים`}{t.decider === 'superTb' ? ', הכרעה בסופר-טייברייק' : ''} · <span className="pill">{MSTATUS[m.status]}</span></p>
      <Flash err={err} ok={ok} />
      {A && B && m.aEntryId && m.bEntryId ? (
        <ScoreForm
          matchId={m.id} tournamentId={t.id} a={{ id: m.aEntryId, name: A }} b={{ id: m.bEntryId, name: B }}
          decider={t.decider === 'set' ? 'set' : 'superTb'} setsToWin={t.setsToWin}
          initial={(m.sets as { a: number; b: number; superTb?: boolean }[])} status={m.status} absent={m.absentEntryId}
        />
      ) : <div className="card muted">המשחק עדיין לא מוכן: ממתין לסיום משחקים קודמים.</div>}
    </Shell>
  );
}
