import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import type { LeagueData } from '@/services/loglig-leagues';

export const dynamic = 'force-dynamic';

export default async function League({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ team?: string }> }) {
  const t = await tr();
  const { id } = await params;
  const { team = '' } = await searchParams;
  const [l] = await db.select().from(schema.externalLeagues).where(eq(schema.externalLeagues.id, id));
  if (!l) notFound();
  const d = l.data as LeagueData;
  const teams = [...new Set(d.groups.flatMap((g) => g.standings.map((s) => s.team)))].sort((a, b) => a.localeCompare(b, 'he'));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }) : '—');
  return (
    <Shell nav="leagues">
      <h1>{l.name}</h1>
      <p className="muted">{t('עודכן')}: {l.updatedAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
      <h2>{t('טבלאות')}</h2>
      <div className="grid cols">
        {d.groups.map((g) => (
          <div key={g.name} className="card" style={{ overflow: 'auto' }}>
            <strong>{g.name}</strong>
            <table><thead><tr><th>#</th><th>{t('קבוצה')}</th><th>{t('מש׳')}</th><th>{t('נק׳')}</th><th>{t('נצ׳')}</th><th>{t('הפ׳')}</th><th>{t('סטים')}</th><th>{t('גיימים')}</th></tr></thead><tbody>
              {g.standings.map((s) => (
                <tr key={s.team}><td>{s.rank}</td><td><a href={`?team=${encodeURIComponent(s.team)}`}>{s.team}</a></td><td>{s.played}</td><td><strong>{s.points}</strong></td><td>{s.wins}</td><td>{s.losses}</td><td>{s.setsFor}–{s.setsAgainst}</td><td>{s.gamesFor}–{s.gamesAgainst}</td></tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </div>
      <h2>{t('לוח משחקים')}</h2>
      <form className="card row" style={{ margin: '8px 0' }}>
        <select name="team" defaultValue={team}><option value="">{t('כל הקבוצות')}</option>{teams.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <button className="btn">{t('סינון')}</button>
      </form>
      {d.rounds.map((r) => {
        const ms = r.matches.filter((m) => !team || m.home.team === team || m.away.team === team);
        if (!ms.length) return null;
        return (
          <section key={r.name} className="card" style={{ overflow: 'auto', marginBottom: 10 }}>
            {/* round names come from the federation as "מחזור 3": in English they read "Round 3" */}
            <strong>{t('מחזור') === 'מחזור' ? r.name : r.name.replace(/^מחזור(?=\s*\d)/, 'Round')}</strong>
            <table><tbody>
              {ms.map((m, i) => (
                <tr key={i}>
                  <td className="muted">{when(m.start)}</td>
                  <td className="muted">{m.group.replace(/^.*\s(בית\s*\S+)$/, '$1')}</td>
                  <td style={{ textAlign: 'end' }}>{m.home.team}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}><strong>{m.done ? `${m.homeScore ?? 0} – ${m.awayScore ?? 0}` : '–'}</strong></td>
                  <td>{m.away.team}</td>
                  <td className="muted">{m.venue}</td>
                  <td>
                    {!!m.rubbers?.length && (
                      <details>
                        <summary className="muted">{t('פירוט משחקים')}</summary>
                        <table><tbody>
                          {m.rubbers.map((x) => {
                            const sc = x.sets.map((s) => `${s.h}-${s.g}`).join(' ');
                            return (
                              <tr key={x.n}>
                                <td style={{ fontWeight: x.winner === 'home' ? 800 : 400 }}>{x.winner === 'home' ? '✓ ' : ''}{x.home.join(' / ')}</td>
                                <td style={{ whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'center' }}>{sc || '–'}</td>
                                <td style={{ fontWeight: x.winner === 'away' ? 800 : 400 }}>{x.winner === 'away' ? '✓ ' : ''}{x.away.join(' / ')}</td>
                              </tr>
                            );
                          })}
                        </tbody></table>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </section>
        );
      })}
    </Shell>
  );
}
