// The federation's yearly Gantt ("לוח תחרויות", an .xlsx linked from its calendar pages) as planned competitions.
// The sheet is a grid of days per month; every competition is a floating text box laid over it, so its dates come from where the box
// sits (start and end column plus the offset inside the cell), not from cell values. No dependencies: a minimal zip reader on node:zlib.
import { inflateRawSync } from 'node:zlib';

/** Files of an .xlsx (a zip), by name -> Buffer. */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    files.set(name, method === 0 ? data : inflateRawSync(data));
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
// A day's cell is about this wide in the drawing's units (EMU): an offset past it is the cell's right edge. Measured on known events
// (a box that starts on the 26th has its left edge at ~0.96 of the 25th's cell).
const CELL = 790000;

/**
 * Text boxes of the Gantt -> [{ text, start, end }] (ISO dates). `year` is the Gantt's year (its title says "לוח תחרויות 2026").
 * A box that runs past the month end continues in the next month's band as a second box: they are merged.
 */
export function parseGantt(xlsx, year) {
  const files = unzip(xlsx);
  const get = (n) => files.get(n)?.toString('utf8') ?? '';
  const sheet = get('xl/worksheets/sheet1.xml'), drawing = get('xl/drawings/drawing1.xml');
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc(m[1].replace(/<[^>]+>/g, '')));
  const rows = [...sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((m) => {
    const cells = new Map();
    for (const c of m[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v !== undefined) cells.set(colIndex(c[1]), / t="s"/.test(c[2]) ? shared[Number(v)] : v);
    }
    return { n: Number(m[1]), cells };
  });
  // each month's band: its label row, and (in the label row or the next) the column holding day 1
  const bands = [];
  for (const r of rows) {
    const name = r.cells.get(0)?.trim();
    const month = MONTHS.indexOf(name ?? '');
    if (month < 0) continue;
    const dayRow = [r, rows.find((x) => x.n === r.n + 1)].find((x) => x && [...x.cells].some(([c, v]) => c > 0 && v === '1'));
    const day1 = dayRow ? [...dayRow.cells].find(([c, v]) => c > 0 && v === '1')?.[0] : undefined;
    if (day1 !== undefined) bands.push({ month, first: r.n, last: r.n + 2, day1 });
  }
  const boxes = [];
  for (const a of drawing.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
    const text = unesc([...a[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('')).replace(/\s+/g, ' ').trim();
    const f = a[0].match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)</);
    const t = a[0].match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(-?\d+)<\/xdr:colOff><xdr:row>(\d+)</);
    if (!text || !f || !t) continue;
    const band = bands.find((b) => Number(f[3]) + 1 >= b.first && Number(f[3]) + 1 <= b.last);
    if (!band) continue; // the legend below the grid
    const edge = (c, off) => Number(c) + Math.min(1, Math.max(0, Number(off) / CELL)); // a boundary between two columns
    const firstDay = Math.round(edge(f[1], f[2])) - band.day1 + 1;
    const lastDay = Math.round(edge(t[1], t[2])) - 1 - band.day1 + 1;
    if (lastDay < firstDay) continue;
    const iso = (d) => new Date(Date.UTC(year, band.month, d)).toISOString().slice(0, 10);
    const box = { text, start: iso(firstDay), end: iso(lastDay), band: band.month };
    // a box laid outside its month, over the year's edge or longer than any competition is a stray drawing, not an event
    if (!box.start.startsWith(String(year)) || !box.end.startsWith(String(year)) || Date.parse(box.end) - Date.parse(box.start) > 20 * 86400000) continue;
    boxes.push(box);
  }
  // continuation across a month end: the same text drawn in the next month's band, starting where the previous box ends
  // (two boxes of one band with the same text are two events, e.g. consecutive weeks of Tennis Europe)
  boxes.sort((x, y) => x.start.localeCompare(y.start));
  const out = [];
  for (const b of boxes) {
    // the earlier box ran to its month's end (its true end was off the grid), the later one starts in the first days of the next month
    const prev = out.find((o) => o.text === b.text && o.band === b.band - 1 && new Date(Date.parse(o.end) + 86400000).getUTCDate() === 1 && Number(b.start.slice(8)) <= 5);
    if (prev) { if (b.end > prev.end) prev.end = b.end; prev.band = b.band; } else out.push({ ...b });
  }
  return out.map(({ band, ...x }) => x).sort((x, y) => x.start.localeCompare(y.start) || x.text.localeCompare(y.text));
}

/**
 * A Gantt text -> what kind of competition it is, or null when it is not one (a bare holiday label, say).
 * Names get the year so the planned entry matches the real competition once ita.co.il publishes it ("ארצית חנוכה 2026").
 */
export function classify(text, year) {
  const raw = text.replace(/\s+/g, ' ').replace(/\bclosed\b/i, '').replace(/\t/g, ' ').trim();
  if (!raw || raw.length < 3) return null;
  const withYear = (n) => (/20[0-9][0-9]/.test(n) ? n : `${n} ${year}`);
  const tidy = raw.replace(/\bITF juniors\b/i, 'ITF Juniors').replace(/\bITF\s*Future\b/i, 'ITF Futures').replace(/^מחזור (\d+)\s*ליגות/, 'מחזור $1 ליגות');
  if (/מאסטרס|masters/i.test(raw)) return { name: withYear(tidy), section: 'MASTERS', level: /ITF/i.test(raw) ? 'INTERNATIONAL' : 'NATIONAL', kind: 'MASTERS' };
  if (/ליגה|ליגת|ליגות|מחזור/.test(raw)) return { name: withYear(tidy), section: /צעירות/.test(raw) ? 'YOUTH' : 'ADULTS', level: 'LEAGUE', kind: 'LEAGUE' };
  if (/tennis europe/i.test(raw)) return { name: tidy.replace(/Tennis Europe\s+/i, 'Tennis Europe '), section: 'YOUTH', level: 'INTERNATIONAL', kind: 'TENNIS_EUROPE' };
  if (/ITF juniors/i.test(raw)) return { name: tidy, section: 'YOUTH', level: 'INTERNATIONAL', kind: 'ITF' };
  if (/ITF/i.test(raw)) return { name: tidy, section: 'ADULTS', level: 'INTERNATIONAL', kind: 'ITF' };
  if (/דייויס|דיוויס|פדרציה|אולימפיאדה/.test(raw)) return { name: withYear(tidy), section: 'ADULTS', level: 'INTERNATIONAL', kind: 'TEAM_CUP' };
  if (/אליפות אירופה|מבחנים/.test(raw)) return { name: withYear(tidy), section: 'YOUTH', level: 'INTERNATIONAL', kind: 'EUROPE' };
  if (/מכביה/.test(raw)) return { name: withYear(tidy), section: 'OTHER', level: 'NATIONAL', kind: 'OTHER' };
  if (/בוגרים|לאומית|אלוף האלופים/.test(raw)) return { name: withYear(tidy), section: 'ADULTS', level: 'NATIONAL', kind: 'ADULTS' };
  const level = /^סבב|סבב זוגות/.test(raw) ? 'CIRCUIT' : /אזורית/.test(raw) ? 'REGIONAL' : 'NATIONAL';
  return { name: withYear(tidy), section: 'YOUTH', level, kind: 'YOUTH' };
}

/** The Gantt's year, from its title cell ("לוח תחרויות 2026"). */
export function ganttYear(xlsx) {
  const m = (unzip(xlsx).get('xl/sharedStrings.xml')?.toString('utf8') ?? '').replace(/<[^>]+>/g, '').match(/לוח תחרויות\s*(20[0-9][0-9])/);
  return m ? Number(m[1]) : null;
}

const CAL_PAGES = ['לוח-תחרויות-נוער-ארציות', 'לוח-תחרויות-נוער-אזוריות', 'לוח-תחרויות-סניורים-לאומיות'];
/** The newest Gantt file linked from the federation's calendar pages (its file name carries the update date). */
export async function findGanttUrl(get) {
  for (const slug of CAL_PAGES) {
    let html;
    try { html = await get(`https://ita.co.il/${encodeURI(slug)}/`); } catch { continue; }
    const links = [...new Set([...html.matchAll(/href="(https:\/\/ita\.co\.il\/wp-content\/uploads\/[^"]+\.xlsx)"/g)].map((m) => m[1]))].filter((u) => /גאנט|%d7%92%d7%90%d7%a0%d7%98/i.test(decodeURIComponent(u)));
    if (links.length) return links.sort().at(-1);
  }
  return null;
}

/** Planned competitions from a Gantt file: [{ name, start, end, section, level, kind }], future and recent ones only (`since` ISO date). */
export function plannedFromGantt(xlsx, year, since = '0000-00-00') {
  const seen = new Set();
  const out = [];
  for (const b of parseGantt(xlsx, year)) {
    if (b.end < since) continue;
    const c = classify(b.text, year);
    if (!c) continue;
    const key = `${c.name}|${b.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, start: b.start, end: b.end });
  }
  return out;
}
