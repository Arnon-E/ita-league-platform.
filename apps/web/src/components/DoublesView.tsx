'use client';
import { Fragment, useMemo, useState } from 'react';
import { MatchScore } from '@/components/MatchScore';
import { DoublesBracket, type BracketTree } from '@/components/DoublesBracket';

type SetScore = { a: number; b: number; superTb?: boolean };
export interface DoublesViewMatch { id: string; a: string[]; b: string[]; sets: SetScore[]; status: string; winner: 'a' | 'b' | null; caption: string; when?: string; group: string; court?: string; slot?: [string, string] }
export interface DoublesViewCat {
  name: string;
  tables: { group: string; info?: string; rows: { pair: string; rank: number; played: number; wins: number; losses: number; setsFor: number; setsAgainst: number }[] }[];
  matches: DoublesViewMatch[];
  bracket?: BracketTree;
}
export interface DoublesViewLabels {
  pair: string; played: string; wins: string; losses: string; sets: string; walkover: string; retired: string; void: string; live: string; won: string;
  bracket: string; pending: string; rounds: Record<string, string>; search: string; all: string; upcoming: string; done: string; expandAll: string; collapseAll: string; of: string;
}

const LINE = '1px solid var(--line, #e1e5df)';
const cell = { border: LINE, padding: '8px 10px' } as const;
const head = { ...cell, background: 'var(--surface2, #f5f6f1)', fontSize: 13, textAlign: 'center' } as const;

/**
 * The doubles draws, one category at a time. Switching category, searching, filtering and opening a group all happen here in the
 * browser: the rest of the page is not reloaded. Each group is a bordered table: when/where, the two pairs and their sets.
 */
export function DoublesView({ cats, labels }: { cats: DoublesViewCat[]; labels: DoublesViewLabels }) {
  const [sel, setSel] = useState(cats[0]?.name ?? '');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'open' | 'done'>('all');
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [lastAll, setLastAll] = useState<'open' | 'closed'>('open'); // what the all-groups button did last
  const cat = cats.find((c) => c.name === sel) ?? cats[0];
  const needle = q.trim().toLowerCase();
  const keep = (m: DoublesViewMatch) =>
    (show === 'all' || (show === 'open') === (m.status === 'SCHEDULED')) && (!needle || [...m.a, ...m.b].some((n) => n.toLowerCase().includes(needle)));
  const groups = useMemo(() => (cat ? cat.tables.map((g) => ({ g, ms: cat.matches.filter((m) => m.group === g.group) })) : []), [cat]);
  if (!cat) return null;
  const filtered = !!needle || show !== 'all';
  const visible = groups.map((x) => ({ ...x, shown: x.ms.filter(keep) })).filter((x) => !filtered || x.shown.length);
  const keyOf = (name: string) => `${cat.name}|${name}`;
  const isOpen = (name: string) => filtered || !closed.has(keyOf(name));
  const toggle = (name: string) => setClosed((s) => { const n = new Set(s); if (n.has(keyOf(name))) n.delete(keyOf(name)); else n.add(keyOf(name)); return n; });
  const setAll = (open: boolean) => { setLastAll(open ? 'open' : 'closed'); setClosed((s) => { const n = new Set(s); for (const x of groups) { if (open) n.delete(keyOf(x.g.group)); else n.add(keyOf(x.g.group)); } return n; }); };
  // the button offers the opposite of the state: all open -> close all, all closed -> open all, mixed -> the opposite of the last press
  const nClosed = groups.filter((x) => closed.has(keyOf(x.g.group))).length;
  const offerOpen = nClosed === groups.length ? true : nClosed === 0 ? false : lastAll === 'closed';
  // with a tree, the knockout matches are in it (with their time and court): no separate cards below
  const koCards = cat.bracket ? [] : cat.matches.filter((m) => !m.group && keep(m));
  const lab = { walkover: labels.walkover, retired: labels.retired, void: labels.void, live: labels.live, won: labels.won };

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>{cats.map((c) => <button key={c.name} type="button" className={`btn small ${c.name === cat.name ? '' : 'ghost'}`} onClick={() => setSel(c.name)}>{c.name}</button>)}</div>
      <h2>{cat.name}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} style={{ width: '100%' }} />
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div role="group" style={{ display: 'inline-flex', border: LINE, borderRadius: 999, padding: 3, background: 'var(--surface, #fff)' }}>
            {([['all', labels.all], ['open', labels.upcoming], ['done', labels.done]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setShow(k)} aria-pressed={show === k}
                style={{ all: 'unset', cursor: 'pointer', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 600, background: show === k ? 'var(--btn, #13306e)' : 'transparent', color: show === k ? 'var(--btn-text, #fff)' : 'inherit' }}>{l}</button>
            ))}
          </div>
          {groups.length > 1 && !filtered && (
            <button type="button" onClick={() => setAll(offerOpen)} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {offerOpen ? labels.expandAll : labels.collapseAll}
            </button>
          )}
        </div>
      </div>
      {/* the knockout tree, as soon as Loglig publishes it (before any knockout match has a time) */}
      {cat.bracket && (
        <div style={{ border: LINE, borderRadius: 14, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
          <button type="button" onClick={() => toggle('::tree')} aria-expanded={isOpen('::tree')} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--surface2, #f5f6f1)', borderBottom: isOpen('::tree') ? LINE : 'none' }}>
            <strong style={{ flex: 1, fontSize: 17 }}>{labels.bracket}</strong>
            <span aria-hidden style={{ width: 28, height: 28, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: LINE, background: 'var(--surface, #fff)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s', transform: isOpen('::tree') ? 'rotate(180deg)' : 'none' }}><path d="M3 5l4 4 4-4" /></svg>
            </span>
          </button>
          {isOpen('::tree') && (
            <DoublesBracket tree={cat.bracket} pending={labels.pending} tt={(s) => labels.rounds[s] ?? s}
              results={cat.matches.filter((m) => !m.group).map((m) => ({ a: m.a, b: m.b, sets: m.sets, status: m.status, winner: m.winner, meta: [m.when, m.court].filter(Boolean).join(' · ') }))} />
          )}
        </div>
      )}
      {visible.map(({ g, ms, shown }) => {
        const open = isOpen(g.group);
        const doneShown = shown.filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID');
        const maxSets = Math.max(0, ...doneShown.map((m) => m.sets.length)); // no set columns until something is played
        const doneCount = ms.filter((m) => m.status !== 'SCHEDULED').length;
        return (
          <div key={g.group} style={{ border: LINE, borderRadius: 14, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
            <button type="button" onClick={() => toggle(g.group)} aria-expanded={open} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--surface2, #f5f6f1)', borderBottom: open ? LINE : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 17, display: 'block' }}>{g.group}</strong>
                {g.info && <span className="muted" style={{ fontSize: 13 }} dir="auto">{g.info}</span>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: doneCount === ms.length && ms.length ? 'var(--okbg, #dcfce7)' : 'var(--surface, #fff)', border: LINE }} dir="ltr">{doneCount}/{ms.length}</span>
              <span aria-hidden style={{ width: 28, height: 28, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: LINE, background: 'var(--surface, #fff)' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}><path d="M3 5l4 4 4-4" /></svg>
              </span>
            </button>
            {open && (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {shown.map((m) => {
                      const done = m.status !== 'SCHEDULED' && m.status !== 'VOID';
                      const note = m.status === 'WALKOVER' ? labels.walkover : m.status === 'RETIRED' ? labels.retired : m.status === 'VOID' ? labels.void : '';
                      const side = (s: 'a' | 'b') => {
                        const won = done && m.winner === s;
                        return (
                          <>
                            <td style={{ ...cell, width: '100%', fontSize: 15, lineHeight: 1.45, fontWeight: won ? 800 : 500, opacity: done && m.winner && !won ? 0.6 : 1 }}>{(s === 'a' ? m.a : m.b).map((n) => <div key={n}>{n}</div>)}</td>
                            {Array.from({ length: maxSets }, (_, i) => {
                              const x = m.sets[i];
                              const mine = x ? (s === 'a' ? x.a : x.b) : 0, other = x ? (s === 'a' ? x.b : x.a) : 0;
                              return <td key={i} dir="ltr" style={{ ...cell, textAlign: 'center', minWidth: 30, fontWeight: x && mine > other ? 800 : 400 }}>{done && x ? mine : ''}</td>;
                            })}
                            {maxSets > 0 && <td style={{ ...cell, width: 28, textAlign: 'center', color: 'var(--ok, #15803d)', fontWeight: 800 }} aria-label={won ? labels.won : undefined}>{won ? '✓' : ''}</td>}
                          </>
                        );
                      };
                      return (
                        <Fragment key={m.id}>
                          <tr>
                            <td rowSpan={2} style={{ ...cell, whiteSpace: 'nowrap', textAlign: 'center', fontSize: 13, verticalAlign: 'middle', background: 'var(--surface2, #f5f6f1)', minWidth: 78 }} dir="auto">
                              <div>{m.slot?.[0]}</div><strong>{m.slot?.[1]}</strong>{m.court && <div className="muted">{m.court}</div>}{note && <div style={{ color: 'var(--warn, #b45309)' }}>{note}</div>}
                            </td>
                            {side('a')}
                          </tr>
                          <tr>{side('b')}</tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {/* the standings only once there is something to rank */}
                {g.rows.some((r) => r.played > 0) && !filtered && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                    <thead><tr>{['#', labels.pair, labels.played, labels.wins, labels.losses, labels.sets].map((h) => <th key={h} style={head}>{h}</th>)}</tr></thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.pair}>
                          <td style={{ ...cell, textAlign: 'center' }}>{r.rank}</td>
                          <td style={{ ...cell, width: '100%' }}>{r.pair.split(' / ').map((n) => <div key={n} style={{ whiteSpace: 'nowrap' }}>{n}</div>)}</td>
                          <td style={{ ...cell, textAlign: 'center' }}>{r.played}</td><td style={{ ...cell, textAlign: 'center' }}>{r.wins}</td><td style={{ ...cell, textAlign: 'center' }}>{r.losses}</td>
                          <td dir="ltr" style={{ ...cell, textAlign: 'center', whiteSpace: 'nowrap' }}>{r.setsFor}-{r.setsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* matches outside the groups (knockout, qualifiers) */}
      {koCards.length > 0 && <div className="grid">{koCards.map((m) => <MatchScore key={m.id} aName={m.a} bName={m.b} sets={m.status === 'SCHEDULED' ? [] : m.sets} status={m.status} winner={m.winner} caption={m.caption} when={m.when} labels={lab} />)}</div>}
      {!visible.length && !koCards.length && !cat.bracket && <div className="card muted">—</div>}
    </>
  );
}
