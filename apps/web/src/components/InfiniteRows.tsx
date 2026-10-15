'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlayerRow { id: string; name: string; club: string | null; gender: string; birthYear: number; rank: number | null }
export interface RankRow { rank: number; playerId: string; name: string; club: string | null; points: number; counted: number }

/** Shared "load the next page when the bottom comes into view" behaviour. */
function useInfinite<T>(initial: T[], pageSize: number, url: (offset: number) => string) {
  const [rows, setRows] = useState<T[]>(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const state = useRef({ busy: false, offset: initial.length, done: initial.length < pageSize });

  const more = useCallback(async () => {
    const s = state.current;
    if (s.busy || s.done) return;
    s.busy = true; setBusy(true); setErr(false);
    try {
      const res = await fetch(url(s.offset));
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as T[];
      s.offset += next.length;
      if (next.length < pageSize) { s.done = true; setDone(true); }
      setRows((r) => [...r, ...next]);
    } catch {
      setErr(true);
    } finally {
      s.busy = false; setBusy(false);
    }
  }, [url, pageSize]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    // IntersectionObserver where available, plus a scroll check as a fallback (older browsers, embedded webviews)
    const near = () => el.getBoundingClientRect().top < window.innerHeight + 400;
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((e) => { if (e[0]?.isIntersecting) void more(); }, { rootMargin: '400px' });
    io?.observe(el);
    const onScroll = () => { if (near()) void more(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (near()) void more();
    return () => { io?.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [more, done, rows.length]);

  return { rows, done, busy, err, more, sentinel };
}

const Footer = ({ done, busy, err, sentinel, more, labels }: { done: boolean; busy: boolean; err: boolean; sentinel: React.RefObject<HTMLDivElement | null>; more: () => void; labels: { loading: string; retry: string; end: string } }) => (
  <div ref={sentinel} className="muted" style={{ textAlign: 'center', padding: 14 }}>
    {err ? <button type="button" className="btn small ghost" onClick={more}>{labels.retry}</button> : busy ? labels.loading : done ? '' : ' '}
  </div>
);

export function PlayersRows({ initial, query, pageSize, genders, labels }: {
  initial: PlayerRow[]; query: string; pageSize: number; genders: Record<string, string>; labels: { player: string; club: string; gender: string; birth: string; rank: string; loading: string; retry: string; end: string; none: string };
}) {
  const { rows, done, busy, err, more, sentinel } = useInfinite<PlayerRow>(initial, pageSize, (o) => `/api/v1/public/players?${query}&offset=${o}&limit=${pageSize}`);
  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table className="stack plist"><thead><tr><th>{labels.player}</th><th>{labels.rank}</th><th>{labels.club}</th><th>{labels.gender}</th><th>{labels.birth}</th></tr></thead><tbody>
        {rows.map((p) => <tr key={p.id}><td><Link href={`/players/${p.id}`}><strong>{p.name}</strong></Link></td><td>{p.rank ? `#${p.rank}` : '—'}</td><td>{p.club ?? '—'}</td><td>{genders[p.gender] ?? ''}</td><td>{p.birthYear}</td></tr>)}
      </tbody></table>
      {!rows.length && <p className="muted">{labels.none}</p>}
      <Footer done={done} busy={busy} err={err} sentinel={sentinel} more={more} labels={labels} />
    </div>
  );
}

export function RankingRows({ initial, query, pageSize, labels }: {
  initial: RankRow[]; query: string; pageSize: number; labels: { player: string; club: string; points: string; counted: string; loading: string; retry: string; end: string; none: string };
}) {
  const { rows, done, busy, err, more, sentinel } = useInfinite<RankRow>(initial, pageSize, (o) => `/api/v1/public/rankings?${query}&offset=${o}&limit=${pageSize}`);
  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table className="stack rank"><thead><tr><th>#</th><th>{labels.player}</th><th>{labels.club}</th><th>{labels.points}</th><th>{labels.counted}</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.playerId}><td>{r.rank}</td><td><Link href={`/players/${r.playerId}`}>{r.name}</Link></td><td>{r.club ?? '—'}</td><td><strong>{r.points}</strong></td><td>{r.counted}<span className="cnt-l">{labels.counted}</span></td></tr>)}
      </tbody></table>
      {!rows.length && <p className="muted">{labels.none}</p>}
      <Footer done={done} busy={busy} err={err} sentinel={sentinel} more={more} labels={labels} />
    </div>
  );
}
