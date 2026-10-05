import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { playerProfile } from '@/services/public';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { rankingFor } from '@/services/rankings';
import { fmtTime, GENDER, MSTATUS } from '@/components/labels';

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await playerProfile(db, id);
  if (!d) notFound();
  const { p, club, ents, names, matches, awards, wins, losses, entryIds } = d;
  const rs = await ensureDefaultRuleSet(db);
  const ranking = await rankingFor(db, p.gender, new Date(), await loadRuleSet(db, rs.id));
  const mine = ranking.find((r) => r.playerId === p.id);
  const age = Math.floor((Date.now() - p.birthDate.getTime()) / (365.25 * 864e5));
  const catOf = new Map(ents.map((x) => [x.c.id, x]));
  return (
    <Shell nav="players">
      <h1>{p.firstName} {p.lastName}</h1>
      <p className="muted">{club ? <>מועדון: {p.clubId ? <Link href={`/clubs/${p.clubId}`}><u>{club}</u></Link> : club} · </> : ''}{GENDER[p.gender]} · גיל {age}</p>
      <div className="grid cols" style={{ marginTop: 12 }}>
        <div className="card"><div className="muted">דירוג</div><strong style={{ fontSize: 28 }}>{mine ? `#${mine.rank}` : '—'}</strong></div>
        <div className="card"><div className="muted">נקודות דירוג</div><strong style={{ fontSize: 28 }}>{mine?.points ?? 0}</strong></div>
        <div className="card"><div className="muted">ניצחונות / הפסדים</div><strong style={{ fontSize: 28 }}>{wins} / {losses}</strong></div>
        <div className="card"><div className="muted">תחרויות</div><strong style={{ fontSize: 28 }}>{new Set(ents.map((x) => x.t.id)).size}</strong></div>
      </div>
      <h2>תחרויות</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>תחרות</th><th>קטגוריה</th><th>תאריך</th></tr></thead><tbody>
          {ents.map(({ e, c, t }) => <tr key={e.id}><td><Link href={`/tournaments/${t.id}`}><u>{t.name}</u></Link></td><td>{c.name}</td><td>{t.startDate.toLocaleDateString('he-IL')}</td></tr>)}
        </tbody></table>
        {!ents.length && <p className="muted">טרם השתתף בתחרויות.</p>}
      </div>
      <h2>משחקים</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>תחרות</th><th>משחק</th><th>תוצאה</th></tr></thead><tbody>
          {matches.filter((m) => m.aEntryId && m.bEntryId).map((m) => {
            const won = !!m.winnerEntryId && entryIds.includes(m.winnerEntryId);
            return (
              <tr key={m.id}>
                <td>{catOf.get(m.categoryId)?.t.name}</td>
                <td><Link href={`/matches/${m.id}`}>{names.get(m.aEntryId!)} – {names.get(m.bEntryId!)}</Link>{m.scheduledStart && m.status === 'SCHEDULED' ? <span className="muted"> · {fmtTime(m.scheduledStart)}</span> : null}</td>
                <td>{m.status === 'SCHEDULED' ? <span className="pill warn">{MSTATUS[m.status]}</span> : <span className={`pill ${won ? 'ok' : 'bad'}`}>{won ? 'ניצחון' : 'הפסד'} {(m.sets as { a: number; b: number }[]).map((s) => `${s.a}-${s.b}`).join(' ')}</span>}</td>
              </tr>
            );
          })}
        </tbody></table>
        {!matches.length && <p className="muted">אין משחקים.</p>}
      </div>
      <h2>היסטוריית נקודות</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>תאריך</th><th>נקודות</th></tr></thead><tbody>
          {awards.map((a) => <tr key={a.id}><td>{a.date.toLocaleDateString('he-IL')}</td><td>{a.points}</td></tr>)}
        </tbody></table>
        {!awards.length && <p className="muted">אין נקודות דירוג.</p>}
      </div>
    </Shell>
  );
}
