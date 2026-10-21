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
        const played = g.rows.some((r) => r.played > 0);
        return (
          <section key={g.group} className="grid">
            <h3 style={{ margin: '8px 0 0' }}>{g.group}</h3>
            {ms.map((m) => card(m))}
            {/* the standings only once there is something to rank */}
            {played && (
              <div className="card" style={{ overflow: 'auto' }}>
                <table style={{ tableLayout: 'auto' }}><thead><tr><th style={{ width: 28 }}>#</th><th>{labels.pair}</th><th>{labels.played}</th><th>{labels.wins}</th><th>{labels.losses}</th><th>{labels.sets}</th></tr></thead><tbody>
                  {g.rows.map((r) => (
                    <tr key={r.pair}>
                      <td>{r.rank}</td>
                      <td style={{ width: '100%', minWidth: 150 }}>{r.pair.split(' / ').map((n) => <div key={n} style={{ whiteSpace: 'nowrap' }}>{n}</div>)}</td>
                      <td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td>
                      <td dir="ltr" style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>{r.setsFor}-{r.setsAgainst}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </section>
        );
      })}
      {/* matches outside the groups (knockout, qualifiers) */}
      {cat.matches.some((m) => !cat.tables.some((g) => g.group === m.group)) && (
        <div className="grid">{cat.matches.filter((m) => !cat.tables.some((g) => g.group === m.group)).map((m) => card(m))}</div>
      )}
    </>
  );
}
