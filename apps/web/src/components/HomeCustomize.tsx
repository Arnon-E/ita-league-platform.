'use client';
import { useCallback, useEffect, useState } from 'react';

export interface HomeItem { key: string; label: string; group: 'blocks' | 'cards' }
interface Prefs { order: string[]; hidden: string[] }
const KEY = 'ita-home-prefs';

const read = (): Prefs => {
  try { const p = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (p && Array.isArray(p.order) && Array.isArray(p.hidden)) return p; } catch { /* a damaged value: start again */ }
  return { order: [], hidden: [] };
};
const write = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: it just will not be kept */ } };

const orderOf = (items: HomeItem[], group: HomeItem['group'], p: Prefs) => {
  const keys = items.filter((i) => i.group === group).map((i) => i.key);
  return [...p.order.filter((k) => keys.includes(k)), ...keys.filter((k) => !p.order.includes(k))];
};
const elOf = (k: string) => document.querySelector<HTMLElement>(`[data-hb="${k}"]`);

/** Puts the order and the hidden flags on the page elements marked data-hb="<key>". */
function apply(items: HomeItem[], p: Prefs) {
  for (const group of ['blocks', 'cards'] as const) {
    orderOf(items, group, p).forEach((k, i) => {
      const el = elOf(k);
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

interface Labels { edit: string; done: string; reset: string; remove: string; drag: string; add: string }

/**
 * Edit mode like a phone's home screen: the pencil makes the blocks and quick cards wiggle; each has an X (hide it) and a grip (drag it to another place);
 * what was hidden waits in the bar to be put back. The choice is kept in this browser only.
 */
export function HomeCustomize({ items, labels }: { items: HomeItem[]; labels: Labels }) {
  const [editing, setEditing] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ order: [], hidden: [] });
  useEffect(() => { const p = read(); setPrefs(p); if (p.order.length || p.hidden.length) apply(items, p); }, [items]);

  const save = useCallback((p: Prefs) => { setPrefs(p); write(p); apply(items, p); }, [items]);

  // the X and the grip of every visible item, only while editing
  useEffect(() => {
    const root = document.querySelector('.homeblocks');
    if (!editing || !root) return;
    root.classList.add('home-edit');
    const made: HTMLElement[] = [];
    for (const it of items) {
      const el = elOf(it.key);
      if (!el || prefs.hidden.includes(it.key)) continue;
      const ctl = document.createElement('span');
      ctl.className = 'hb-ctl';
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'hb-x'; x.textContent = '×'; x.setAttribute('aria-label', labels.remove);
      x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); save({ ...prefs, hidden: [...prefs.hidden, it.key] }); };
      const grip = document.createElement('button');
      grip.type = 'button'; grip.className = 'hb-grip'; grip.textContent = '⠿'; grip.setAttribute('aria-label', labels.drag);
      grip.onclick = (e) => { e.preventDefault(); e.stopPropagation(); };
      grip.onpointerdown = (e) => {
        e.preventDefault(); e.stopPropagation();
        grip.setPointerCapture(e.pointerId);
        let cur = orderOf(items, it.group, prefs);
        const move = (ev: PointerEvent) => {
          // by the boxes on screen: elementFromPoint skips elements that do not take the pointer
          const k = cur.find((x) => { const r = elOf(x)?.getBoundingClientRect(); return !!r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
          if (!k || k === it.key || !cur.includes(k) || prefs.hidden.includes(k)) return;
          const i = cur.indexOf(it.key), j = cur.indexOf(k);
          cur = [...cur]; cur[i] = k; cur[j] = it.key;
          apply(items, { ...prefs, order: [...prefs.order.filter((x) => !cur.includes(x)), ...cur] });
        };
        const up = () => {
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
          save({ ...prefs, order: [...prefs.order.filter((x) => !cur.includes(x)), ...cur] });
        };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
      };
      ctl.append(x, grip);
      el.append(ctl);
      made.push(ctl);
    }
    return () => { root.classList.remove('home-edit'); made.forEach((m) => m.remove()); };
  }, [editing, prefs, items, labels.remove, labels.drag, save]);

  const hidden = items.filter((i) => prefs.hidden.includes(i.key));
  return (
    <div className="hb-top">
      {!editing && (
        <button type="button" className="hb-pencil" onClick={() => setEditing(true)} aria-label={labels.edit} title={labels.edit}>
          <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      )}
      {editing && (
        <div className="hb-bar card">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <button type="button" className="btn ink" onClick={() => setEditing(false)}>{labels.done}</button>
            <button type="button" className="btn ghost" onClick={() => save({ order: [], hidden: [] })}>{labels.reset}</button>
          </div>
          {hidden.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              <span className="muted">{labels.add}</span>
              {hidden.map((i) => <button key={i.key} type="button" className="pill" onClick={() => save({ ...prefs, hidden: prefs.hidden.filter((x) => x !== i.key) })}>+ {i.label}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
