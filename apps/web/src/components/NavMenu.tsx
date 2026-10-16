'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The site menu. On wide screens it is the usual inline row of links; on phones it collapses behind a hamburger button
 * and opens as a full-width list that closes again when a link is chosen or the page changes.
 */
export function NavMenu({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" className="burger" aria-label={label} aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
      </button>
      {open && <div className="navscrim" onClick={() => setOpen(false)} />}
      <nav id="site-nav" className={open ? 'open' : ''} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>{children}</nav>
    </>
  );
}
