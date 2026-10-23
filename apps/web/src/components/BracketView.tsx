import type { ReactNode } from 'react';
import Link from 'next/link';
import { roundName } from '@/services/bracket';

/** One side of a bracket box: the name(s) (a pair has two), the sets from this side's point of view, and whether it won / is the viewer's own. */
export interface BracketSide { names: string[]; sets: ReactNode; win?: boolean; me?: boolean }
/** A match box; `href` makes it a link (singles open the match page). */
export interface BracketCell { href?: string; a: BracketSide; b: BracketSide; /** when and where, e.g. "St 25.10.2026 10:00 · מרה"ט חיפה" */ meta?: string }

/**
 * The knockout tree used by every competition, singles and doubles: columns from the first round to the final (cols[0] is the first round,
 * each column with half the slots of the one before; a null cell is a bye or a round not played yet). Layout and look come from the
 * `.tree` styles in globals.css.
 */
export function BracketView({ cols, tt, pending }: { cols: (BracketCell | null)[][]; tt: (s: string) => string; pending: string }) {
  const side = (s: BracketSide) => (
    <div className={[s.win ? 'w' : '', s.me ? 'me' : ''].join(' ')}>
      <span className={s.names.length > 1 ? 'nm pair' : 'nm'}>{s.names.length ? s.names.map((n) => <span key={n} style={{ display: 'block' }}>{n}</span>) : pending}</span>
      <span className="sc" dir="ltr">{s.sets}</span>
    </div>
  );
  const meta = (c: BracketCell) => (c.meta ? <div className="meta" dir="auto">{c.meta}</div> : null);
  return (
    <div className="card tree-card">
      <div className="tree">
        {cols.map((col, k) => {
          const title = roundName(cols.length - 1 - k);
          const box = (c: BracketCell | null, key: number) => (
            <div key={key} className="tcell">
              {c
                ? c.href ? <Link href={c.href} className="tm">{side(c.a)}{side(c.b)}{meta(c)}</Link> : <div className="tm">{side(c.a)}{side(c.b)}{meta(c)}</div>
                : <div className={`tm empty ${k ? '' : 'bye'}`} />}
            </div>
          );
          return (
            <div key={k} className="tcol">
              <h3>{title ? tt(title) : `${tt('סיבוב')} ${k + 1}`}</h3>
              <div className="tcells">
                {col.length === 1 ? box(col[0]!, 0) : Array.from({ length: col.length / 2 }, (_, j) => <div key={j} className="tpair">{box(col[2 * j]!, 0)}{box(col[2 * j + 1]!, 1)}</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
