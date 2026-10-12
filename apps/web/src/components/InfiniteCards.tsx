'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface CompCard { id: string; name: string; status: string; statusLabel: string; statusCls: string; level: string; dates: string; deadline: string | null }

/** Competition cards, revealed a screenful at a time as the user scrolls (the filtered list itself is small, only the DOM is big). */
export function InfiniteCards({ items, step = 24 }: { items: CompCard[]; step?: number }) {
  const [shown, setShown] = useState(step);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setShown(step); }, [items, step]);
  useEffect(() => {
    const el = end.current;
    if (!el || shown >= items.length) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setShown((n) => Math.min(items.length, n + step)); }, { rootMargin: '500px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, items.length, step]);
  return (
    <>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {items.slice(0, shown).map((x) => (
          <Link key={x.id} href={`/tournaments/${x.id}`} className="card grid" style={{ gap: 8 }}>
            <span><span className={`pill ${x.statusCls}`}>{x.statusLabel}</span></span>
            <strong style={{ fontSize: 18, lineHeight: 1.3 }}>{x.name}</strong>
            <span className="muted">{x.level}</span>
            <span className="muted">{x.dates}</span>
            {x.deadline && <span className="muted">{x.deadline}</span>}
          </Link>
        ))}
      </div>
      <div ref={end} style={{ height: 1 }} />
    </>
  );
}
