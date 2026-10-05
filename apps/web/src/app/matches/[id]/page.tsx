import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Flash, Shell } from '@/components/Shell';
import { matchDetail } from '@/services/queries';
import { fmtTime, MSTATUS, fmtScore } from '@/components/labels';
import { ScoreForm } from './ScoreForm';
import { getActor } from '@/lib/session';
import { tr } from '@/lib/i18n';

export default async function MatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const tt = await tr();
  const { id } = await params;
  const { err, ok } = await searchParams;
  const d = await matchDetail(db, id);
  if (!d) notFound();
  const { m, c, t, names } = d;
  const actor = await getActor();
  const scorer = !!actor && ['SUPER_ADMIN', 'FEDERATION_ADMIN', 'TOURNAMENT_MANAGER', 'REFEREE'].includes(actor.role);
  const A = m.aEntryId ? names.get(m.aEntryId) ?? '?' : null;
  const B = m.bEntryId ? names.get(m.bEntryId) ?? '?' : null;
  return (
    <Shell nav="home">
      <Link href={`/tournaments/${t.id}?tab=results`} className="muted">{tt('← חזרה לתחרות')}</Link>
      <h1>{c.name} · {m.stage === 'GROUP' ? `${tt('בית, מחזור')} ${m.round}` : `${tt('הדחה, סיבוב')} ${m.round}`}</h1>
      <p className="muted">{m.courtLabel ? `מגרש ${m.courtLabel} · ${fmtTime(m.scheduledStart)} · ` : ''}{t.setsToWin === 2 ? tt('הטוב מ-3 סטים') : `${t.setsToWin} ${tt('סטים')}`}{t.decider === 'superTb' ? tt(', הכרעה בסופר-טייברייק') : ''} · {m.live && m.status === 'SCHEDULED' ? <span className="pill lime">משחק חי</span> : <span className="pill">{tt(MSTATUS[m.status] ?? '')}</span>}</p>
      {m.live && m.status === 'SCHEDULED' && !scorer && <meta httpEquiv="refresh" content="15" />}
      <Flash err={err} ok={ok} />
      {A && B && m.aEntryId && m.bEntryId && !scorer ? (
        <div className="card grid"><h2 style={{ margin: 0 }}>{A} – {B}</h2><strong style={{ fontSize: 22 }}>{(m.sets as { a: number; b: number }[]).length ? fmtScore(m.sets as { a: number; b: number }[]) : tt('טרם התחיל')}</strong>{m.live && m.status === 'SCHEDULED' && <span className="pill lime">{tt('משחק חי · הדף מתרענן אוטומטית')}</span>}{m.winnerEntryId && <span className="pill ok">{tt('מנצח/ת:')} {names.get(m.winnerEntryId)}</span>}</div>
      ) : A && B && m.aEntryId && m.bEntryId ? (
        <ScoreForm
          matchId={m.id} tournamentId={t.id} a={{ id: m.aEntryId, name: A }} b={{ id: m.bEntryId, name: B }}
          decider={t.decider === 'set' ? 'set' : 'superTb'} setsToWin={t.setsToWin}
          initial={(m.sets as { a: number; b: number; superTb?: boolean }[])} status={m.status} absent={m.absentEntryId}
        />
      ) : <div className="card muted">{tt('המשחק עדיין לא מוכן: ממתין לסיום משחקים קודמים.')}</div>}
    </Shell>
  );
}
