import type { ReactNode } from 'react';

/** A section that can be folded away: the title row is the button, with a small drawn chevron. Open by default; native <details>, so it needs no script. */
export function Fold({ title, id, children, open = true }: { title: string; id?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fold" id={id} open={open}>
      <summary>
        <h2>{title}</h2>
        <span className="chev" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5l4 4 4-4" /></svg>
        </span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
