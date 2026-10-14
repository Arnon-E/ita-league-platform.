import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { FollowButton } from '@/components/FollowButton';
import { playerProfile } from '@/services/public';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { rankingFor } from '@/services/rankings';
import { fmtTime, GENDER, MSTATUS, fmtScore } from '@/components/labels';

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
  const recent = matches
    .filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.winnerEntryId)
    .sort((a, b) => (b.scheduledStart?.getTime() ?? 0) - (a.scheduledStart?.getTime() ?? 0))
    .slice(0, 5)
    .map((m) => entryIds.includes(m.winnerEntryId!));
  const next = ents.filter(({ t }) => t.endDate.getTime() >= Date.now()).sort((a, b) => a.t.startDate.getTime() - b.t.startDate.getTime())[0];
  const initials = `${p.firstName.slice(0, 1)}${p.lastName.slice(0, 1)}`;
  return (
    <Shell nav="players">
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ flexWrap: 'nowrap' }}><span className="pavatar" aria-hidden>{initials}</span><h1>{p.firstName} {p.lastName}</h1></span><FollowButton kind="PLAYER" target={p.id} back={`/players/${p.id}`} /></div>
      <p className="muted">{club ? <>מועדון: {p.clubId ? <Link href={`/clubs/${p.clubId}`}><u>{club}</u></Link> : club} · </> : ''}{GENDER[p.gender]} · גיל {age}</p>
      <div className="grid cols" style={{ marginTop: 12 }}>
        <div className="card"><div className="muted">דירוג</div><strong style={{ fontSize: 28 }}>{mine ? `#${mine.rank}` : '—'}</strong></div>
        <div className="card"><div className="muted">נקודות דירוג</div><strong style={{ fontSize: 28 }}>{mine?.points ?? 0}</strong></div>
        <div className="card"><div className="muted">ניצחונות / הפסדים</div><strong dir="ltr" style={{ fontSize: 28 }}>{wins} / {losses}</strong></div>
        <div className="card"><div className="muted">תחרויות</div><strong style={{ fontSize: 28 }}>{new Set(ents.map((x) => x.t.id)).size}</strong></div>
      </div>
      {(recent.length > 0 || next) && (
        <div className="card row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          {recent.length > 0 && <div><div className="muted" style={{ marginBottom: 6 }}>משחקים אחרונים</div><div className="pform">{recent.map((w, i) => <i key={i} className={w ? 'w' : 'l'}>{w ? 'נ' : 'ה'}</i>)}</div></div>}
          {next && <div><div className="muted" style={{ marginBottom: 6 }}>התחרות הבאה</div><Link href={`/tournaments/${next.t.id}`}><strong>{next.t.name}</strong></Link> <span className="muted">· {next.t.startDate.toLocaleDateString('he-IL')}</span></div>}
        </div>
      )}
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
                <td>{m.status === 'SCHEDULED' ? <span className="pill warn">{MSTATUS[m.status]}</span> : <span className={`pill ${won ? 'ok' : 'bad'}`}>{won ? 'ניצחון' : 'הפסד'} {fmtScore(m.sets as { a: number; b: number }[])}</span>}</td>
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
