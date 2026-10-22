'use client';
import { useId, useMemo, useRef, useState } from 'react';

type Club = { id: string; name: string };

/**
 * Picks a club by typing instead of scrolling a list of hundreds. Inside a GET form it submits a hidden `name` field holding the club id
 * (empty = all clubs) and applies the choice at once, like AutoSelect.
 */
export function ClubSearch({ name, clubs, defaultValue = '', l }: { name: string; clubs: Club[]; defaultValue?: string; l: { all: string; placeholder: string; none: string; clear: string } }) {
  const id = useId();
  const selected = clubs.find((c) => c.id === defaultValue);
  const [value, setValue] = useState(defaultValue);
  const [text, setText] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hidden = useRef<HTMLInputElement>(null);
  const norm = (s: string) => s.toLocaleLowerCase().replace(/["'״׳.,\-–]/g, ' ').replace(/\s+/g, ' ').trim();
  const typed = value && text === (clubs.find((c) => c.id === value)?.name ?? '') ? '' : norm(text);
  const matches = useMemo(() => {
    if (!typed) return clubs.slice(0, 8);
    const starts: Club[] = [], inside: Club[] = [];
    for (const c of clubs) { const n = norm(c.name); if (n.startsWith(typed)) starts.push(c); else if (n.includes(typed)) inside.push(c); }
    return [...starts, ...inside].slice(0, 8);
  }, [clubs, typed]);
  const options: Club[] = [{ id: '', name: l.all }, ...matches];
  const apply = (c: Club) => {
    setValue(c.id); setText(c.id ? c.name : ''); setOpen(false);
    // the hidden field is updated by React on the next render; submit after it has the new value
    requestAnimationFrame(() => hidden.current?.form?.requestSubmit());
  };
  return (
    <div className="cs">
      <input ref={hidden} type="hidden" name={name} value={value} />
      <input
        className="cs-in" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open ? `${id}-${active}` : undefined}
        placeholder={l.placeholder} aria-label={l.placeholder} value={text} autoComplete="off" enterKeyHint="search"
        onFocus={(e) => { setOpen(true); setActive(0); if (value) e.currentTarget.select(); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(1); if (value) setValue(''); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); const c = options[Math.min(active, options.length - 1)]; if (c) apply(c); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {(value || text) && <button type="button" className="cs-x" aria-label={l.clear} onMouseDown={(e) => e.preventDefault()} onClick={() => apply({ id: '', name: '' })}>×</button>}
      {open && (
        <ul className="cs-list" id={`${id}-list`} role="listbox">
          {options.map((c, i) => (
            <li key={c.id || 'all'} id={`${id}-${i}`} role="option" aria-selected={i === active} className={`${i === active ? 'on' : ''} ${c.id === '' ? 'all' : ''}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => apply(c)} onMouseEnter={() => setActive(i)}>{c.name}</li>
          ))}
          {typed && !matches.length && <li className="none" role="presentation">{l.none}</li>}
        </ul>
      )}
    </div>
  );
}
