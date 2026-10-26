'use client';
import Link from 'next/link';
import { SafeImg } from '@/components/SafeImg';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlayerRow { id: string; name: string; club: string | null; gender: string; birthYear: number; rank: number | null; photo?: string | null }
export interface RankRow { rank: number; playerId: string; name: string; club: string | null; points: number; counted: number; photo?: string | null }

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

/** The player's picture (hosted by Loglig, loaded only when it scrolls into view), else the initials. */
function Avatar({ photo, name, cls }: { photo?: string | null; name: string; cls: string }) {
  const letters = <span className={cls} aria-hidden="true">{initials(name)}</span>;
  return photo ? <SafeImg src={photo} className={`${cls} img`} fallback={letters} /> : letters;
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]).join('').toUpperCase();

export function PlayersRows({ initial, query, pageSize, genders, labels }: {
  initial: PlayerRow[]; query: string; pageSize: number; genders: Record<string, string>; labels: { player: string; club: string; gender: string; birth: string; rank: string; age?: string; loading: string; retry: string; end: string; none: string };
}) {
  const year = new Date().getFullYear();
  const { rows, done, busy, err, more, sentinel } = useInfinite<PlayerRow>(initial, pageSize, (o) => `/api/v1/public/players?${query}&offset=${o}&limit=${pageSize}`);
  return (
    <div className="card prows">
      <ul>
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={`/players/${p.id}`}>
              <Avatar photo={p.photo} name={p.name} cls={`pav ${p.gender === 'FEMALE' ? 'f' : p.gender === 'MALE' ? 'm' : ''}`} />
              <span className="pmain"><strong>{p.name}</strong><span className="muted">{p.club ?? '—'}</span></span>
              <span className="pside"><b className={`prank${p.rank ? (p.rank <= 3 ? ` top r${p.rank}` : '') : ' none'}`} title={labels.rank}>{p.rank ? `#${p.rank}` : '—'}</b><span className="muted" title={String(p.birthYear)}>{labels.age ? `${labels.age} ${year - p.birthYear}` : p.birthYear} · {genders[p.gender] ?? ''}</span></span>
            </Link>
          </li>
        ))}
      </ul>
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
        {rows.map((r) => <tr key={r.playerId}><td><span className={`rkn${r.rank <= 3 ? ` r${r.rank}` : ''}`}>{r.rank}</span></td><td><Link href={`/players/${r.playerId}`} className="rname"><Avatar photo={r.photo} name={r.name} cls="pav sm" />{r.name}</Link></td><td>{r.club ?? '—'}</td><td><strong>{r.points}</strong></td><td>{r.counted}<span className="cnt-l">{labels.counted}</span></td></tr>)}
      </tbody></table>
      {!rows.length && <p className="muted">{labels.none}</p>}
      <Footer done={done} busy={busy} err={err} sentinel={sentinel} more={more} labels={labels} />
    </div>
  );
}
