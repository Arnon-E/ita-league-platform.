import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { Flag } from '@/components/Flag';
import { Fold } from '@/components/Fold';
import { BracketView, type BracketCell, type BracketSide } from '@/components/BracketView';
import { fmtScore } from '@/components/labels';
import { MatchScore } from '@/components/MatchScore';
import { tr } from '@/lib/i18n';
import { countryInfo } from '@/lib/countries';
import { abroadEvent, groupTable, phaseOf, type DrawMatch } from '@/services/abroad';
import { acceptedWithLinks } from '@/services/abroad-players';
import { catOf, catsPresent, drawActive, matchPending, pickCategory, pickTab, sortDraws, type AbroadCat, type AbroadTab } from '@/services/abroad-view';

export const dynamic = 'force-dynamic';

const TZ = 'Asia/Jerusalem';
/** A nation's flag as Tennis Europe's own site shows it (its three-letter code is the file name), so no table of codes is needed. */
const flagUrl = (cc: string) => `https://static.tournamentsoftware.com/content/images/flags/${cc}.svg`;

/** Public to everyone: a Tennis Europe tournament abroad that is on or just ended, with the matches and results of the Israeli players in it. */
export default async function AbroadEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string; tab?: string }> }) {
  const t = await tr();
  const { id } = await params;
  const q = await searchParams;
  const e = await abroadEvent(db, id);
  if (!e) notFound();
  const phase = phaseOf({ start: e.startDate, end: e.endDate });
  const matches = e.results?.matches ?? [];
  const days = [...new Set(matches.map((m) => m.day))].sort().reverse(); // the latest day first
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric' });
  const range = `${e.startDate.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' })} – ${e.endDate.toLocaleDateString('he-IL', { timeZone: TZ })}`;
  const where = [e.city, t(countryInfo(e.country).he)].filter(Boolean).join(', ');

  // a knockout draw as the site's own tree: first round first, each round half the size of the one before (a missing slot is a bye); the Israelis are marked
  const sideOf = (m: DrawMatch, k: 'a' | 'b'): BracketSide => ({ names: m[k].names, flags: m[k].names.map((_, i) => (m[k].cc[i] ? flagUrl(m[k].cc[i]!) : '')), win: m[k].won, me: m[k].cc.includes('ISR'), sets: m.sets.length ? m.sets.map((s, i) => <b key={i}>{s[k === 'a' ? 0 : 1]}</b>) : null });
  // a qualifying draw is several small trees side by side (each ends in one qualifier): the first round holds as many matches as all of them together
  const treesOf = (rounds: DrawMatch[][]) => {
    const size = 2 ** (rounds.length - 1);
    const n = Math.max(1, Math.ceil((rounds[0]?.length ?? 0) / size));
    return Array.from({ length: n }, (_, i) => rounds.map((round, k): (BracketCell | null)[] => {
      const want = 2 ** (rounds.length - 1 - k);
      return Array.from({ length: want }, (_, j) => { const m = round[i * want + j]; return m ? { a: sideOf(m, 'a'), b: sideOf(m, 'b'), meta: dateOf(m.date) || undefined } : null; });
    }));
  };
  const dateOf = (d: string) => d.replace(/^[A-Za-z]{3}\s+/, '').replace(/\//g, '.');
  const draws = e.results?.draws ?? [];
  const accepted = e.acceptance?.length ? await acceptedWithLinks(db, e.acceptance).catch(() => []) : [];

  // the names of one side as the site's match card shows them: the flag in front of each name (a pair has two)
  const namesOf = (x: { names: string[]; cc: string[] }) => x.names.map((n, i) => <span key={i} dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{x.cc[i] && <img src={flagUrl(x.cc[i]!)} width={18} height={13} alt={x.cc[i]} style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)' }} />}{n}</span>);
  const statusOf = (m: { sets: unknown[]; a: { msg: string; won: boolean }; b: { msg: string; won: boolean } }) => (/walkover/i.test(m.a.msg + m.b.msg) ? 'WALKOVER' : /retire/i.test(m.a.msg + m.b.msg) ? 'RETIRED' : m.sets.length || m.a.won || m.b.won ? 'COMPLETED' : 'SCHEDULED');

  // one category at a time (boys, girls, doubles), and within it one of: the matches, the draws, who is registered
  const cats = catsPresent([...matches.map((m) => m.draw), ...draws.map((d) => d.name), ...accepted.map((a) => a.label)]);
  const cat = pickCategory(cats, matches, draws, q.cat);
  const catMatches = matches.filter((m) => catOf(m.draw) === cat);
  const catDraws = sortDraws(draws.filter((d) => catOf(d.name) === cat));
  const catAccepted = accepted.filter((a) => catOf(a.label) === cat);
  const tabs: { key: AbroadTab; label: string; n: number }[] = ([
    { key: 'm', label: t('משחקים'), n: catMatches.length }, { key: 'd', label: t('הגרלות'), n: catDraws.length }, { key: 'r', label: t('רשומים'), n: catAccepted.reduce((n, a) => n + a.players.length, 0) },
  ] as const).filter((x) => x.n > 0);
  const tab = pickTab(tabs.map((x) => x.key), q.tab);
  const href = (c: AbroadCat | null, tb: AbroadTab | null) => `/abroad/${id}?${[c && `cat=${c}`, tb && `tab=${tb}`].filter(Boolean).join('&')}`;
  const catName: Record<AbroadCat, string> = { B: t('בנים'), G: t('בנות'), D: t('זוגות') };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const catDays = [...new Set(catMatches.map((m) => m.day))].sort().reverse(); // the latest day first
  const openDays = catDays.some((d) => d >= today) ? catDays.filter((d) => d >= today) : catDays.slice(0, 1); // today and what is coming, else the latest day

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
      {cats.length > 1 && (
        <nav className="tabs" aria-label={t('קטגוריה')} style={{ marginBottom: 0 }}>
          {cats.map((c) => <Link key={c} href={href(c, tab)} className={c === cat ? 'on' : ''} replace scroll={false}>{catName[c]}</Link>)}
        </nav>
      )}
      {tabs.length > 0 && (
        <nav className="tabs" aria-label={t('תצוגה')} style={cats.length > 1 ? { marginTop: 8 } : undefined}>
          {tabs.map((x) => <Link key={x.key} href={href(cat, x.key)} className={x.key === tab ? 'on' : ''} replace scroll={false}>{x.label} <span className="muted">{x.n}</span></Link>)}
        </nav>
      )}
      {tab === 'r' && (
        <div className="grid cols">
          {catAccepted.map((a) => (
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
      )}
      {tab === 'm' && (
        <>
          {e.results?.updated && <p className="muted" style={{ margin: 0 }}>{t('עודכן')} {new Date(e.results.updated).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
          {catDays.map((d) => (
            <Fold key={d} title={d === today ? `${t('היום')} · ${dayLabel(d)}` : dayLabel(d)} open={openDays.includes(d)}>
              <div className="grid cols">
                {catMatches.filter((m) => m.day === d).map((m, i) => (
                  <div key={`${d}-${i}`} className="card">
                    <MatchScore aName={namesOf(m.a)} bName={namesOf(m.b)} sets={m.sets.map(([x, y]) => ({ a: x ?? 0, b: y ?? 0 }))} status={statusOf(m)} winner={m.a.won ? 'a' : m.b.won ? 'b' : null} mine={m.a.cc.includes('ISR') ? 'a' : m.b.cc.includes('ISR') ? 'b' : undefined}
                      caption={<span dir="ltr">{m.draw}{m.stage ? ` · ${m.stage}` : ''}</span>} when={[m.time, m.court].filter(Boolean).join(' · ') || undefined} />
                  </div>
                ))}
              </div>
            </Fold>
          ))}
        </>
      )}
      {tab === 'd' && (() => {
        const first = catDraws.findIndex(drawActive);
        const openAt = first >= 0 ? first : 0; // the draw an Israeli is still playing in, else the first
        return catDraws.map((d, i) => (
          <Fold key={d.n} title={d.name} open={i === openAt}>
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
                      {round.filter((m) => m.a.names.length && m.b.names.length).map((m, j) => {
                        const decided = m.a.won || m.b.won;
                        const side = (x: DrawMatch['a']) => <span style={{ fontWeight: x.won ? 800 : 500, opacity: decided && !x.won ? 0.6 : 1, color: x.cc.includes('ISR') ? 'var(--blue)' : undefined }}>{x.won ? '✓ ' : ''}{x.names.join(' / ')}</span>;
                        const mine = m.a.cc.includes('ISR') ? m.a : m.b.cc.includes('ISR') ? m.b : null; // the Israeli's own result, spelled out
                        return (
                          <div key={j} className="grid" style={{ gap: 0 }}>
                            <span dir="ltr" style={{ textAlign: 'start' }}>{side(m.a)} – {side(m.b)}</span>
                            <span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{m.sets.length ? fmtScore(m.sets.map(([a, b]) => ({ a: a ?? 0, b: b ?? 0 }))) : t('טרם שוחק')}{mine && decided && <> <span className={`pill ${mine.won ? 'ok' : 'bad'}`} style={{ padding: '0 8px', fontSize: 11.5 }}>{mine.won ? t('ניצחון') : t('הפסד')}</span></>}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                (() => { const trees = treesOf(d.rounds); return trees.map((cols, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    {trees.length > 1 && <strong className="muted">{t('עץ')} {i + 1}</strong>}
                    <BracketView cols={cols} tt={t} pending={t('טרם נקבע')} />
                  </div>
                )); })()
              )}
          </Fold>
        ));
      })()}
      {tabs.length === 0 && (
        <div className="card muted">{phase === 'up' ? t('הטורניר עוד לא התחיל.') : t('עדיין אין משחקים של שחקנים ישראלים בטורניר, או שהמארגן עוד לא פירסם אותם. לכל המשחקים אפשר לעבור לדף הטורניר ב-Tennis Europe.')}</div>
      )}
      <p className="muted" style={{ marginTop: 18 }}>{t('המשחקים נלקחים מהאתר של Tennis Europe ומתעדכנים בערך פעם בשעה בזמן הטורניר.')}</p>
    </Shell>
  );
}
