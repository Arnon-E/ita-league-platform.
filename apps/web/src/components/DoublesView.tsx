'use client';
import { useState } from 'react';
import { MatchScore } from '@/components/MatchScore';

export interface DoublesViewCat {
  name: string;
  tables: { group: string; info?: string; rows: { pair: string; rank: number; played: number; wins: number; losses: number; setsFor: number; setsAgainst: number }[] }[];
  matches: { id: string; a: string[]; b: string[]; sets: { a: number; b: number; superTb?: boolean }[]; status: string; winner: 'a' | 'b' | null; caption: string; when?: string; group: string; court?: string; slot?: [string, string] }[];
}
export interface DoublesViewLabels { pair: string; played: string; wins: string; losses: string; sets: string; walkover: string; retired: string; void: string; live: string; won: string }

/** The doubles draws, one category at a time. The category is switched here in the browser: the rest of the page is not reloaded. */
export function DoublesView({ cats, labels }: { cats: DoublesViewCat[]; labels: DoublesViewLabels }) {
  const [sel, setSel] = useState(cats[0]?.name ?? '');
  const cat = cats.find((c) => c.name === sel) ?? cats[0];
  if (!cat) return null;
  const card = (m: DoublesViewCat['matches'][number]) => (
    <MatchScore key={m.id} aName={m.a} bName={m.b} sets={m.status === 'SCHEDULED' ? [] : m.sets} status={m.status} winner={m.winner} caption={m.caption} when={m.when}
      labels={{ walkover: labels.walkover, retired: labels.retired, void: labels.void, live: labels.live, won: labels.won }} />
  );
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>{cats.map((c) => <button key={c.name} type="button" className={`btn small ${c.name === cat.name ? '' : 'ghost'}`} onClick={() => setSel(c.name)}>{c.name}</button>)}</div>
      <h2>{cat.name}</h2>
      {cat.tables.map((g) => {
        const ms = cat.matches.filter((m) => m.group === g.group);
        const key = (x: string[]) => x.join(' / ');
        // the round-robin grid, as on Loglig: a row and a column per pair; the cell holds the result, or when the match is played
        const cell = (row: string, col: string) => {
          const m = ms.find((x) => (key(x.a) === row && key(x.b) === col) || (key(x.a) === col && key(x.b) === row));
          if (!m) return <span className="muted">-</span>;
          const mine: 'a' | 'b' = key(m.a) === row ? 'a' : 'b';
          if (m.status === 'SCHEDULED' || m.status === 'VOID') return <span className="muted" style={{ fontSize: 12, lineHeight: 1.25, display: 'block' }}>{m.slot?.[0]}<br />{m.slot?.[1]}</span>;
          if (m.status === 'WALKOVER' && !m.sets.length) return <strong>{m.winner === mine ? labels.won : labels.walkover}</strong>;
          return <span dir="ltr" style={{ fontWeight: m.winner === mine ? 800 : 400, fontSize: 13, display: 'block', lineHeight: 1.3 }}>{m.sets.map((x, i) => <span key={i} style={{ display: 'block' }}>{mine === 'a' ? x.a : x.b}-{mine === 'a' ? x.b : x.a}</span>)}</span>;
        };
        const order = g.rows.map((r) => r.pair);
        return (
          <div key={g.group} className="card" style={{ overflow: 'auto' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><strong>{g.group}</strong>{g.info && <span className="muted" dir="auto">{g.info}</span>}</div>
            <table style={{ tableLayout: 'auto', textAlign: 'center' }}><thead><tr><th style={{ width: 24 }}>#</th><th style={{ textAlign: 'start' }}>{labels.pair}</th>{order.map((_, i) => <th key={i}>{i + 1}</th>)}<th>{labels.wins}</th></tr></thead><tbody>
              {g.rows.map((r, i) => (
                <tr key={r.pair}>
                  <td>{i + 1}</td>
                  <td style={{ textAlign: 'start', minWidth: 120 }}>{r.pair.split(' / ').map((n) => <div key={n} style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{n}</div>)}</td>
                  {order.map((c, j) => <td key={j} style={i === j ? { background: 'var(--line, #e5e7eb)' } : { padding: '6px 8px' }}>{i === j ? '' : cell(r.pair, c)}</td>)}
                  <td><strong>{r.wins}</strong></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        );
      })}
      {/* matches outside the groups (knockout, qualifiers) */}
      {cat.matches.some((m) => !cat.tables.some((g) => g.group === m.group)) && (
        <div className="grid">{cat.matches.filter((m) => !cat.tables.some((g) => g.group === m.group)).map((m) => card(m))}</div>
      )}
    </>
  );
}
