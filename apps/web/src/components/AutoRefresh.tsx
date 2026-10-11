'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-fetches the current server page every few seconds while it is mounted and visible.
 * (A <meta http-equiv="refresh"> tag would survive client-side navigation and reload whatever page the user moved to.)
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
