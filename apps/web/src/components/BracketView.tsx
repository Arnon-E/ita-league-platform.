import type { ReactNode } from 'react';
import Link from 'next/link';
import { roundName } from '@/services/bracket';

/** One side of a bracket box: the name(s) (a pair has two), the sets from this side's point of view, and whether it won / is the viewer's own. */
export interface BracketSide { names: string[]; sets: ReactNode; win?: boolean; me?: boolean; /** flag image per name (same order as `names`), empty for none */ flags?: string[] }
/** A match box; `href` makes it a link (singles open the match page). */
export interface BracketCell { href?: string; a: BracketSide; b: BracketSide; /** when and where, e.g. "St 25.10.2026 10:00 · מרה"ט חיפה" */ meta?: string }

/**
 * The knockout tree used by every competition, singles and doubles: columns from the first round to the final (cols[0] is the first round,
 * each column with half the slots of the one before; a null cell is a bye or a round not played yet). Layout and look come from the
 * `.tree` styles in globals.css.
 */
export function BracketView({ cols, tt, pending, extra = [] }: { cols: (BracketCell | null)[][]; tt: (s: string) => string; pending: string; extra?: { title: string; cell: BracketCell }[] }) {
  const side = (s: BracketSide, other?: BracketSide) => (
    <div className={[s.win ? 'w' : other?.win ? 'l' : '', s.me ? 'me' : ''].join(' ')}>
      <span className={s.names.length > 1 ? 'nm pair' : 'nm'}>{s.names.length ? s.names.map((n, i) => <span key={n} style={{ display: 'block' }}>{s.flags?.[i] && <img src={s.flags[i]} width={18} height={13} alt="" loading="lazy" style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)', verticalAlign: 'middle', marginInlineEnd: 6 }} />}{n}</span>) : pending}</span>
      {s.win && <span className="ck" aria-label={tt('המנצח')} title={tt('המנצח')}><svg aria-hidden viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}<span className="sc" dir="ltr">{s.sets}</span>
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
                ? c.href ? <Link href={c.href} className="tm">{side(c.a, c.b)}{side(c.b, c.a)}{meta(c)}</Link> : <div className="tm">{side(c.a, c.b)}{side(c.b, c.a)}{meta(c)}</div>
                : <div className={`tm empty ${k ? '' : 'bye'}`} />}
            </div>
          );
          return (
            <div key={k} className={`tcol${k === cols.length - 1 ? ' final' : ''}`}>
              <h3><span>{title ? tt(title) : `${tt('סיבוב')} ${k + 1}`}</span></h3>
              <div className="tcells">
                {col.length === 1 ? box(col[0]!, 0) : Array.from({ length: col.length / 2 }, (_, j) => <div key={j} className="tpair">{box(col[2 * j]!, 0)}{box(col[2 * j + 1]!, 1)}</div>)}
              </div>
            </div>
          );
        })}
      </div>
      {/* matches outside the tree: the losers of the semifinals play for places 3-4 */}
      {extra.length > 0 && (
        <div className="tree" style={{ paddingTop: 0 }}>
          {extra.map((x, i) => (
            <div key={i} className="tcol">
              <h3><span>{x.title}</span></h3>
              <div className="tcell">{x.cell.href ? <Link href={x.cell.href} className="tm">{side(x.cell.a, x.cell.b)}{side(x.cell.b, x.cell.a)}{meta(x.cell)}</Link> : <div className="tm">{side(x.cell.a, x.cell.b)}{side(x.cell.b, x.cell.a)}{meta(x.cell)}</div>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
