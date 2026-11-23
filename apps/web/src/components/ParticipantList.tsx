'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export interface ParticipantItem { id: string; playerId: string; name: string; last: string; club: string | null; photo: string | null; order: number | null; created: number }
export interface ParticipantLabels { byName: string; byTime: string; search: string; none: string }

/** The confirmed players of a category: search by name or club, and sort by name or by when they registered. */
export function ParticipantList({ items, labels }: { items: ParticipantItem[]; labels: ParticipantLabels }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'time'>('name');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? items.filter((x) => `${x.name} ${x.club ?? ''}`.toLowerCase().includes(needle)) : items.slice();
    // registration order: Loglig's roster position, then the time we first saw the entry (people not mirrored from Loglig)
    const byTime = (a: ParticipantItem, b: ParticipantItem) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.created - b.created;
    return list.sort(sort === 'time' ? byTime : (a, b) => a.last.localeCompare(b.last, 'he') || a.name.localeCompare(b.name, 'he'));
  }, [items, q, sort]);
  return (
    <>
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search} style={{ flex: 1, minWidth: 0 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'time')} aria-label={`${labels.byName} / ${labels.byTime}`}>
          <option value="name">{labels.byName}</option>
          <option value="time">{labels.byTime}</option>
        </select>
      </div>
      <ul className="plist">
        {shown.map((x, i) => (
          <li key={x.id}>
            {sort === 'time' && <span className="muted" style={{ minWidth: 22 }}>{i + 1}</span>}
            {x.photo ? <img src={x.photo} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" /> : <span className="pavatar" aria-hidden style={{ width: 40, height: 40, fontSize: 15 }}>{x.name.charAt(0)}</span>}
            <Link href={`/players/${x.playerId}`}><strong>{x.name}</strong></Link>
            {x.club && <span className="muted">{x.club}</span>}
          </li>
        ))}
        {shown.length === 0 && <li className="muted">{labels.none}</li>}
      </ul>
    </>
  );
}
