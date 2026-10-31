'use client';
import { useEffect, useState } from 'react';

export interface HomeItem { key: string; label: string; group: 'blocks' | 'cards' }
interface Prefs { order: string[]; hidden: string[] }
const KEY = 'ita-home-prefs';

const read = (): Prefs => {
  try { const p = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (p && Array.isArray(p.order) && Array.isArray(p.hidden)) return p; } catch { /* a damaged value: start again */ }
  return { order: [], hidden: [] };
};

/** Shows, hides and reorders the blocks and quick cards of the home page marked with data-hb="<key>"; the choice is kept in this browser only. */
function apply(items: HomeItem[], p: Prefs) {
  for (const group of ['blocks', 'cards'] as const) {
    const keys = items.filter((i) => i.group === group).map((i) => i.key);
    const ordered = [...p.order.filter((k) => keys.includes(k)), ...keys.filter((k) => !p.order.includes(k))];
    ordered.forEach((k, i) => {
      const el = document.querySelector<HTMLElement>(`[data-hb="${k}"]`);
      if (!el) return;
      el.style.order = String(i);
      el.style.display = p.hidden.includes(k) ? 'none' : '';
    });
  }
  // an odd number of quick cards: the last one fills the row on a phone
  const cards = [...document.querySelectorAll<HTMLElement>('nav.bento > a')].filter((a) => a.style.display !== 'none').sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
  document.querySelectorAll('nav.bento > a.wide').forEach((a) => a.classList.remove('wide'));
  if (cards.length % 2 === 1) cards[cards.length - 1]!.classList.add('wide');
}

export function HomeCustomize({ items, labels }: { items: HomeItem[]; labels: { open: string; title: string; blocks: string; cards: string; reset: string; close: string; up: string; down: string } }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ order: [], hidden: [] });
  useEffect(() => { const p = read(); setPrefs(p); if (p.order.length || p.hidden.length) apply(items, p); }, [items]);
  const save = (p: Prefs) => { setPrefs(p); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: it just will not be kept */ } apply(items, p); };
  const orderOf = (group: HomeItem['group']) => {
    const keys = items.filter((i) => i.group === group).map((i) => i.key);
    return [...prefs.order.filter((k) => keys.includes(k)), ...keys.filter((k) => !prefs.order.includes(k))];
  };
  const move = (group: HomeItem['group'], k: string, d: -1 | 1) => {
    const o = orderOf(group); const i = o.indexOf(k); const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    save({ ...prefs, order: [...prefs.order.filter((x) => !o.includes(x)), ...o] });
  };
  const toggle = (k: string) => save({ ...prefs, hidden: prefs.hidden.includes(k) ? prefs.hidden.filter((x) => x !== k) : [...prefs.hidden, k] });
  const label = (k: string) => items.find((i) => i.key === k)?.label ?? k;
  const list = (group: HomeItem['group'], title: string) => (
    <div className="grid" style={{ gap: 6 }}>
      <strong>{title}</strong>
      {orderOf(group).map((k, i, o) => (
        <div key={k} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
          <label className="row" style={{ gap: 8, flex: 1, alignItems: 'center', flexWrap: 'nowrap' }}>
            <input type="checkbox" checked={!prefs.hidden.includes(k)} onChange={() => toggle(k)} />
            <span>{label(k)}</span>
          </label>
          <button type="button" className="btn ghost" aria-label={labels.up} disabled={i === 0} onClick={() => move(group, k, -1)}>↑</button>
          <button type="button" className="btn ghost" aria-label={labels.down} disabled={i === o.length - 1} onClick={() => move(group, k, 1)}>↓</button>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ order: -1, marginBottom: 10 }}>
      <button type="button" className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? labels.close : labels.open}</button>
      {open && (
        <div className="card grid homesheet" style={{ gap: 14 }}>
          <strong style={{ fontSize: 17 }}>{labels.title}</strong>
          {list('blocks', labels.blocks)}
          {list('cards', labels.cards)}
          <div className="row"><button type="button" className="btn ghost" onClick={() => save({ order: [], hidden: [] })}>{labels.reset}</button></div>
        </div>
      )}
    </div>
  );
}
