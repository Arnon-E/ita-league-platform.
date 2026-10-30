import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { Flag } from '@/components/Flag';
import { Fold } from '@/components/Fold';
import { BracketView, type BracketCell, type BracketSide } from '@/components/BracketView';
import { fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { countryInfo } from '@/lib/countries';
import { abroadEvent, groupTable, phaseOf, type DrawMatch } from '@/services/abroad';
import { acceptedWithLinks } from '@/services/abroad-players';

export const dynamic = 'force-dynamic';

const TZ = 'Asia/Jerusalem';
/** A nation's flag as Tennis Europe's own site shows it (its three-letter code is the file name), so no table of codes is needed. */
const flagUrl = (cc: string) => `https://static.tournamentsoftware.com/content/images/flags/${cc}.svg`;

/** Public to everyone: a Tennis Europe tournament abroad that is on or just ended, with the matches and results of the Israeli players in it. */
export default async function AbroadEventPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await tr();
  const { id } = await params;
  const e = await abroadEvent(db, id);
  if (!e) notFound();
  const phase = phaseOf({ start: e.startDate, end: e.endDate });
  const matches = e.results?.matches ?? [];
  const days = [...new Set(matches.map((m) => m.day))].sort().reverse(); // the latest day first
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric' });
  const range = `${e.startDate.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' })} – ${e.endDate.toLocaleDateString('he-IL', { timeZone: TZ })}`;
  const where = [e.city, t(countryInfo(e.country).he)].filter(Boolean).join(', ');

  // a knockout draw as the site's own tree: first round first, each round half the size of the one before (a missing slot is a bye); the Israelis are marked
  const sideOf = (m: DrawMatch, k: 'a' | 'b'): BracketSide => ({ names: m[k].names, win: m[k].won, me: m[k].cc.includes('ISR'), sets: m.sets.length ? m.sets.map((s, i) => <b key={i}>{s[k === 'a' ? 0 : 1]}</b>) : null });
  const treeOf = (rounds: DrawMatch[][]) => rounds.map((round, k): (BracketCell | null)[] => {
    const want = 2 ** (rounds.length - 1 - k);
    return Array.from({ length: want }, (_, i) => (round[i] ? { a: sideOf(round[i]!, 'a'), b: sideOf(round[i]!, 'b'), meta: dateOf(round[i]!.date) || undefined } : null));
  });
  const dateOf = (d: string) => d.replace(/^[A-Za-z]{3}\s+/, '').replace(/\//g, '.');
  const draws = e.results?.draws ?? [];
  const accepted = e.acceptance?.length ? await acceptedWithLinks(db, e.acceptance).catch(() => []) : [];

  const Side = ({ s }: { s: { names: string[]; cc: string[]; won: boolean; msg: string } }) => (
    <span className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'baseline', fontWeight: s.won ? 800 : 500, ...(s.cc.includes('ISR') ? { color: 'var(--blue)' } : {}) }}>
      <span style={{ display: 'inline-flex', gap: 3, flex: 'none' }}>{s.cc.map((c, i) => <img key={i} src={flagUrl(c)} width={20} height={15} alt={c} style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)' }} />)}</span>
      <span dir="ltr" style={{ textAlign: 'start' }}>{s.names.join(' / ')}</span>
      {s.msg && <span className="muted" style={{ fontWeight: 400 }}>{s.msg}</span>}
    </span>
  );

  return (
    <Shell nav="abroad">
      <p style={{ margin: 0 }}><Link href="/abroad" className="muted"><u>{t('חזרה לתחרויות חו"ל')}</u></Link></p>
      <h1 style={{ marginBottom: 4 }}>{e.name}</h1>
      <p className="muted" style={{ margin: 0 }}><Flag country={e.country} /> {where} · {range}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <span className={`pill ${phase === 'live' ? 'lime' : ''}`}>{phase === 'live' ? t('מתקיימת עכשיו') : phase === 'done' ? t('הסתיימה') : t('בקרוב')}</span>
        {e.ageGroup && <span className="pill">U{e.ageGroup}</span>}
        {e.category && <span className="pill">{e.category}</span>}
        <a className="btn ghost" href={e.url} target="_blank" rel="noopener noreferrer">{t('כל המשחקים והתוצאות ב-Tennis Europe')}</a>
      </div>
      {accepted.length > 0 && (
        <>
          <h2>{t('ישראלים רשומים')}</h2>
          <div className="grid cols">
            {accepted.map((a) => (
              <div key={a.label} className="card grid" style={{ gap: 6 }}>
                <strong dir="ltr" style={{ textAlign: 'start' }}>{a.label} <span className="muted" style={{ fontWeight: 400 }}>· {a.players.length} {t('ישראלים')}</span></strong>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>{t('שם')}</th><th>{t('שנת לידה')}</th>{a.players.some((p) => p.rank && p.rank !== '-') && <th>{t('דירוג')}</th>}</tr></thead>
                    <tbody>
                      {a.players.map((p) => (
                        <tr key={p.draw + p.n + p.name}>
                          <td>{p.player ? <Link href={`/players/${p.player.id}`}><u>{p.player.first} {p.player.last}</u></Link> : null}<div dir="ltr" className={p.player ? 'muted' : undefined} style={{ textAlign: 'start' }}>{p.name}</div></td>
                          <td>{p.born ?? ''}</td>{a.players.some((x) => x.rank && x.rank !== '-') && <td dir="ltr">{p.rank && p.rank !== '-' ? `#${p.rank}` : ''}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <h2>{t('משחקים של שחקנים ישראלים')}</h2>
      {e.results?.updated && <p className="muted" style={{ margin: 0 }}>{t('עודכן')} {new Date(e.results.updated).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      {days.length ? days.map((d) => (
        <section key={d}>
          <h3 style={{ margin: '16px 0 8px' }}>{dayLabel(d)}</h3>
          <div className="grid cols">
            {matches.filter((m) => m.day === d).map((m, i) => (
              <div key={`${d}-${i}`} className="card grid" style={{ gap: 8 }}>
                <span className="grid" style={{ gap: 2 }}><span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{m.draw}{m.stage ? ` · ${m.stage}` : ''}</span><span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{[m.time, m.court].filter(Boolean).join(' · ')}</span></span>
                <Side s={m.a} />
                <Side s={m.b} />
                <span className="muted" style={{ fontWeight: 600 }}>{m.sets.length ? fmtScore(m.sets.map(([a, b]) => ({ a: a ?? 0, b: b ?? 0 }))) : t('טרם שוחק')}</span>
              </div>
            ))}
          </div>
        </section>
      )) : (
        <div className="card muted">{phase === 'up' ? t('הטורניר עוד לא התחיל.') : t('עדיין אין משחקים של שחקנים ישראלים בטורניר, או שהמארגן עוד לא פירסם אותם. לכל המשחקים אפשר לעבור לדף הטורניר ב-Tennis Europe.')}</div>
      )}
      {draws.length > 0 && (
        <>
          <h2>{t('הגרלות')}</h2>
          {draws.map((d, i) => (
            <Fold key={d.n} title={d.name} open={i === 0}>
              {d.kind === 'RR' ? (
                <div className="card grid" style={{ gap: 10 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead><tr><th>#</th><th>{t('שחקן')}</th><th>{t('נצחונות')}</th><th>{t('סטים')}</th></tr></thead>
                      <tbody>
                        {groupTable(d.rounds).map((r, k) => (
                          <tr key={r.names.join('/')} style={r.cc.includes('ISR') ? { fontWeight: 700, color: 'var(--blue)' } : undefined}>
                            <td>{k + 1}</td>
                            <td dir="ltr" style={{ textAlign: 'start' }}><span style={{ display: 'inline-flex', gap: 3, marginInlineEnd: 6, verticalAlign: 'middle' }}>{r.cc.map((c, j) => <img key={j} src={flagUrl(c)} width={20} height={15} alt={c} style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)' }} />)}</span>{r.names.join(' / ')}</td>
                            <td dir="ltr">{r.won}/{r.played}</td><td dir="ltr">{r.setsWon}-{r.setsLost}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {d.rounds.map((round, k) => (
                    <div key={k} className="grid" style={{ gap: 6 }}>
                      <strong className="muted">{t('סיבוב')} {k + 1}</strong>
                      {round.filter((m) => m.a.names.length && m.b.names.length).map((m, j) => (
                        <div key={j} className="grid" style={{ gap: 0 }}>
                          <span dir="ltr" style={{ textAlign: 'start' }}><span style={{ fontWeight: m.a.won ? 800 : 500, color: m.a.cc.includes('ISR') ? 'var(--blue)' : undefined }}>{m.a.names.join(' / ')}</span> – <span style={{ fontWeight: m.b.won ? 800 : 500, color: m.b.cc.includes('ISR') ? 'var(--blue)' : undefined }}>{m.b.names.join(' / ')}</span></span>
                          <span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{m.sets.length ? fmtScore(m.sets.map(([a, b]) => ({ a: a ?? 0, b: b ?? 0 }))) : t('טרם שוחק')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <BracketView cols={treeOf(d.rounds)} tt={t} pending={t('טרם נקבע')} />
              )}
            </Fold>
          ))}
        </>
      )}
      <p className="muted" style={{ marginTop: 18 }}>{t('המשחקים נלקחים מהאתר של Tennis Europe ומתעדכנים בערך פעם בשעה בזמן הטורניר.')}</p>
    </Shell>
  );
}
