'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface CompCard { id: string; name: string; status: string; statusLabel: string; statusCls: string; level: string; dates: string; deadline: string | null; group: string; action: string; day: string; mon: string }

/** Competition cards, revealed a screenful at a time as the user scrolls (the filtered list itself is small, only the DOM is big). */
export function InfiniteCards({ items, step = 24 }: { items: CompCard[]; step?: number }) {
  const [shown, setShown] = useState(step);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setShown(step); }, [items, step]);
  useEffect(() => {
    const el = end.current;
    if (!el || shown >= items.length) return;
    const grow = () => setShown((n) => Math.min(items.length, n + step));
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((e) => { if (e[0]?.isIntersecting) grow(); }, { rootMargin: '500px' });
    io?.observe(el);
    const onScroll = () => { if (el.getBoundingClientRect().top < window.innerHeight + 500) grow(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io?.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [shown, items.length, step]);
  return (
    <>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {items.slice(0, shown).map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className={`card grid comp ${x.group}`} style={{ gap: 8 }}>
            <span className="top"><span className={`pill ${x.statusCls}`}>{x.statusLabel}</span><span className="muted">{x.level}</span></span>
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="dateblk"><b>{x.day}</b><span>{x.mon}</span></span>
              <strong style={{ fontSize: 17, lineHeight: 1.3 }}>{x.name}</strong>
            </span>
            <span className="muted">{x.dates}</span>
            <span className="foot">
              <span className="muted">{x.deadline ?? ''}</span>
              <span className={`act ${x.group === 'open' ? 'primary' : ''}`}>{x.action}</span>
            </span>
          </Link>
        ))}
      </div>
      <div ref={end} style={{ height: 1 }} />
    </>
  );
}
