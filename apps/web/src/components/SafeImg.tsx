'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A picture hosted by someone else (Loglig's player photos): lazy, without a referrer, and when the file is missing or broken the
 * `fallback` (initials, a number) is shown instead of an empty frame. A picture that already failed before the page was interactive
 * (it arrives in the server-rendered HTML) never fires `onError` here, so it is checked once on mount.
 */
export function SafeImg({ src, className, fallback }: { src: string; className?: string; fallback: ReactNode }) {
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setBad(false);
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBad(true);
  }, [src]);
  if (bad) return <>{fallback}</>;
  return <img ref={ref} className={className} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}
