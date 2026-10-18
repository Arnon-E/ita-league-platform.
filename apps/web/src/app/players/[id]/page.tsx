import Link from 'next/link';
import { notFound } from 'next/navigation';
import { photoUrl } from '@/lib/photos';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { FollowButton } from '@/components/FollowButton';
import { playerProfile } from '@/services/public';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { rankingFor } from '@/services/rankings';
import { fmtDate, fmtTime, GENDER, MSTATUS, fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await tr();
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
  // The same tournament can appear once per category entered: show it once, with its categories listed.
  const byTournament: { t: (typeof ents)[number]['t']; cats: string[] }[] = [];
  for (const { c, t } of ents) {
    const g = byTournament.find((x) => x.t.id === t.id);
    if (!g) byTournament.push({ t, cats: [c.name] });
    else if (!g.cats.includes(c.name)) g.cats.push(c.name);
  }
  byTournament.sort((a, b) => b.t.startDate.getTime() - a.t.startDate.getTime());
  const initials = `${p.firstName.slice(0, 1)}${p.lastName.slice(0, 1)}`;
  return (
    <Shell nav="players">
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ flexWrap: 'nowrap' }}>{photoUrl(p.photo) ? <img className="pavatar-img" src={photoUrl(p.photo)!} alt="" referrerPolicy="no-referrer" /> : <span className="pavatar" aria-hidden>{initials}</span>}<h1>{p.firstName} {p.lastName}</h1></span><FollowButton kind="PLAYER" target={p.id} back={`/players/${p.id}`} /></div>
      <p className="muted">{club ? <>{t('מועדון')}: {p.clubId ? <Link href={`/clubs/${p.clubId}`}><u>{club}</u></Link> : club} · </> : ''}{t(GENDER[p.gender] ?? '')} · {t('גיל')} {age}</p>
      <div className="grid cols" style={{ marginTop: 12 }}>
        <div className="card"><div className="muted">{t('דירוג')}</div><strong style={{ fontSize: 28 }}>{mine ? `#${mine.rank}` : '—'}</strong></div>
        <div className="card"><div className="muted">{t('נקודות דירוג')}</div><strong style={{ fontSize: 28 }}>{mine?.points ?? 0}</strong></div>
        <div className="card"><div className="muted">{t('ניצחונות / הפסדים')}</div><strong dir="ltr" style={{ fontSize: 28 }}>{wins} / {losses}</strong></div>
        <div className="card"><div className="muted">{t('תחרויות')}</div><strong style={{ fontSize: 28 }}>{new Set(ents.map((x) => x.t.id)).size}</strong></div>
      </div>
      {(recent.length > 0 || next) && (
        <div className="card row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          {recent.length > 0 && <div><div className="muted" style={{ marginBottom: 6 }}>{t('משחקים אחרונים')}</div><div className="pform">{recent.map((w, i) => <i key={i} className={w ? 'w' : 'l'}>{t(w ? 'נ' : 'ה')}</i>)}</div></div>}
          {next && <div><div className="muted" style={{ marginBottom: 6 }}>{t('התחרות הבאה')}</div><Link href={`/tournaments/${next.t.id}`}><strong>{next.t.name}</strong></Link> <span className="muted">· {fmtDate(next.t.startDate)}</span></div>}
        </div>
      )}
      <h2>{t('תחרויות')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t('תחרות')}</th><th>{t('קטגוריה')}</th><th>{t('תאריך')}</th></tr></thead><tbody>
          {byTournament.map((g) => <tr key={g.t.id}><td><Link href={`/tournaments/${g.t.id}`}><u>{g.t.name}</u></Link></td><td>{g.cats.join(' · ')}</td><td>{fmtDate(g.t.startDate)}</td></tr>)}
        </tbody></table>
        {!byTournament.length && <p className="muted">{t('טרם השתתף בתחרויות.')}</p>}
      </div>
      <h2>{t('משחקים')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t('תחרות')}</th><th>{t('משחק')}</th><th>{t('תוצאה')}</th></tr></thead><tbody>
          {matches.filter((m) => m.aEntryId && m.bEntryId).map((m) => {
            const won = !!m.winnerEntryId && entryIds.includes(m.winnerEntryId);
            return (
              <tr key={m.id}>
                <td>{catOf.get(m.categoryId)?.t.name}</td>
                <td><Link href={`/matches/${m.id}`}>{names.get(m.aEntryId!)} – {names.get(m.bEntryId!)}</Link>{m.scheduledStart && m.status === 'SCHEDULED' ? <span className="muted"> · {fmtTime(m.scheduledStart)}</span> : null}</td>
                <td>{m.status === 'SCHEDULED' ? <span className="pill warn">{t(MSTATUS[m.status] ?? m.status)}</span> : <span className={`pill ${won ? 'ok' : 'bad'}`}>{t(won ? 'ניצחון' : 'הפסד')} {fmtScore(m.sets as { a: number; b: number }[])}</span>}</td>
              </tr>
            );
          })}
        </tbody></table>
        {!matches.length && <p className="muted">{t('אין משחקים.')}</p>}
      </div>
      <h2>{t('היסטוריית נקודות')}</h2>
      <div className="card" style={{ overflow: 'auto' }}>
        <table><thead><tr><th>{t('תאריך')}</th><th>{t('נקודות')}</th></tr></thead><tbody>
          {awards.map((a) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{a.points}</td></tr>)}
        </tbody></table>
        {!awards.length && <p className="muted">{t('אין נקודות דירוג.')}</p>}
      </div>
    </Shell>
  );
}
