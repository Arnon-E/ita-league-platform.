'use client';
import { Fragment, useMemo, useState } from 'react';
import { MatchScore } from '@/components/MatchScore';

type SetScore = { a: number; b: number; superTb?: boolean };
export interface DoublesViewMatch { id: string; a: string[]; b: string[]; sets: SetScore[]; status: string; winner: 'a' | 'b' | null; caption: string; when?: string; group: string; court?: string; slot?: [string, string] }
export interface DoublesViewCat {
  name: string;
  tables: { group: string; info?: string; rows: { pair: string; rank: number; played: number; wins: number; losses: number; setsFor: number; setsAgainst: number }[] }[];
  matches: DoublesViewMatch[];
}
export interface DoublesViewLabels {
  pair: string; played: string; wins: string; losses: string; sets: string; walkover: string; retired: string; void: string; live: string; won: string;
  search: string; all: string; upcoming: string; done: string; expandAll: string; collapseAll: string; of: string;
}

const LINE = '1px solid var(--line2, #cfd5cf)';
const cell = { border: LINE, padding: '6px 8px' } as const;
const head = { ...cell, background: 'var(--soft, #f3f4f1)', fontSize: 13, textAlign: 'center' } as const;

/**
 * The doubles draws, one category at a time. Switching category, searching, filtering and opening a group all happen here in the
 * browser: the rest of the page is not reloaded. Each group is a bordered table: when/where, the two pairs and their sets.
 */
export function DoublesView({ cats, labels }: { cats: DoublesViewCat[]; labels: DoublesViewLabels }) {
  const [sel, setSel] = useState(cats[0]?.name ?? '');
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'open' | 'done'>('all');
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
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
  const setAll = (open: boolean) => setClosed((s) => { const n = new Set(s); for (const x of groups) { if (open) n.delete(keyOf(x.g.group)); else n.add(keyOf(x.g.group)); } return n; });
  const koCards = cat.matches.filter((m) => !m.group && keep(m));
  const lab = { walkover: labels.walkover, retired: labels.retired, void: labels.void, live: labels.live, won: labels.won };

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>{cats.map((c) => <button key={c.name} type="button" className={`btn small ${c.name === cat.name ? '' : 'ghost'}`} onClick={() => setSel(c.name)}>{c.name}</button>)}</div>
      <h2>{cat.name}</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} style={{ flex: 1, minWidth: 160 }} />
        {([['all', labels.all], ['open', labels.upcoming], ['done', labels.done]] as const).map(([k, l]) => <button key={k} type="button" className={`btn small ${show === k ? '' : 'ghost'}`} onClick={() => setShow(k)}>{l}</button>)}
      </div>
      {groups.length > 1 && !filtered && (
        <div className="row"><button type="button" className="btn small ghost" onClick={() => setAll(true)}>{labels.expandAll}</button><button type="button" className="btn small ghost" onClick={() => setAll(false)}>{labels.collapseAll}</button></div>
      )}
      {visible.map(({ g, ms, shown }) => {
        const open = isOpen(g.group);
        const maxSets = Math.max(1, ...shown.map((m) => m.sets.length));
        const doneCount = ms.filter((m) => m.status !== 'SCHEDULED').length;
        return (
          <div key={g.group} style={{ border: LINE, borderRadius: 14, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
            <button type="button" onClick={() => toggle(g.group)} aria-expanded={open} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--soft, #f3f4f1)' }}>
              <strong style={{ flex: 1 }}>{g.group}</strong>
              <span className="muted" style={{ fontSize: 13 }} dir="auto">{g.info ? `${g.info} · ` : ''}{doneCount} {labels.of} {ms.length}</span>
              <span aria-hidden style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
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
                            <td style={{ ...cell, width: '100%', fontWeight: won ? 800 : 500, opacity: done && m.winner && !won ? 0.65 : 1 }}>{(s === 'a' ? m.a : m.b).map((n) => <div key={n}>{n}</div>)}</td>
                            {Array.from({ length: maxSets }, (_, i) => {
                              const x = m.sets[i];
                              const mine = x ? (s === 'a' ? x.a : x.b) : 0, other = x ? (s === 'a' ? x.b : x.a) : 0;
                              return <td key={i} dir="ltr" style={{ ...cell, textAlign: 'center', minWidth: 30, fontWeight: x && mine > other ? 800 : 400 }}>{done && x ? mine : ''}</td>;
                            })}
                            <td style={{ ...cell, width: 28, textAlign: 'center', color: 'var(--ok, #15803d)', fontWeight: 800 }} aria-label={won ? labels.won : undefined}>{won ? '✓' : ''}</td>
                          </>
                        );
                      };
                      return (
                        <Fragment key={m.id}>
                          <tr>
                            <td rowSpan={2} style={{ ...cell, whiteSpace: 'nowrap', textAlign: 'center', fontSize: 13, verticalAlign: 'middle' }} dir="auto">
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
      {!visible.length && !koCards.length && <div className="card muted">—</div>}
    </>
  );
}
