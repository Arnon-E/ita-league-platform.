'use client';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

/** A filter/search form (GET). Submits as a soft navigation that keeps the scroll position, instead of reloading the whole page. */
export function GetForm({ action, className, style, children }: { action?: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const router = useRouter();
  return (
    <form
      action={action}
      className={className}
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        const qs = new URLSearchParams();
        new FormData(e.currentTarget).forEach((v, k) => { if (typeof v === 'string') qs.append(k, v); });
        router.replace(`${action ?? window.location.pathname}?${qs.toString()}`, { scroll: false });
      }}
    >
      {children}
    </form>
  );
}
