// Pure parsing helpers for the public ITA / Loglig pages (no network, no side effects, unit tested).

export const MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8,
  'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
};

const ENT = { '&nbsp;': ' ', '&quot;': '"', '&amp;': '&', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#8211;': '–', '&#8220;': '"', '&#8221;': '"' };
export const decode = (s) => s.replace(/&[#a-z0-9]+;/gi, (m) => ENT[m] ?? (/^&#(\d+);$/.test(m) ? String.fromCharCode(Number(m.slice(2, -1))) : m));
export const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Visible text with line breaks kept at block boundaries. */
export const toLines = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<\/(p|div|h\d|li|tr|section)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const pad = (n) => String(n).padStart(2, '0');
const month = (w) => MONTHS[(w ?? '').replace(/^ב/, '')];

/** "18 - 20 בספטמבר 2026" | "27 בספטמבר - 3 באוקטובר 2026" | "15 בנובמבר 2026" -> { start, end } as YYYY-MM-DD, or null. */
export function parseDateRange(text) {
  const t = text.replace(/[–—]/g, '-');
  let m = t.match(/(\d{1,2})\s*(?:ב?([א-ת]+))?\s*-\s*(\d{1,2})\s*(ב?[א-ת]+)\s*(\d{4})/);
  if (m) {
    const endM = month(m[4]);
    const startM = m[2] ? month(m[2]) : endM;
    if (!endM || !startM) return null;
    const y = Number(m[5]);
    return { start: `${y}-${pad(startM)}-${pad(m[1])}`, end: `${y}-${pad(endM)}-${pad(m[3])}` };
  }
  m = t.match(/(\d{1,2})\s*(ב?[א-ת]+)\s*(\d{4})/);
  if (m && month(m[2])) { const d = `${m[3]}-${pad(month(m[2]))}-${pad(m[1])}`; return { start: d, end: d }; }
  return null;
}

/** Competition page -> details and the list of public category pages (with the section they sit in). */
export function parseCompetitionPage(html, url = '') {
  const lines = toLines(html);
  const name = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? '') || strip((html.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '').replace(/\s*-\s*איגוד הטניס.*$/, '');
  const ranges = lines.filter((l) => l.startsWith('מועדי המשחקים')).map((l) => parseDateRange(l.replace(/^[^:]*:/, ''))).filter(Boolean);
  const starts = ranges.map((r) => r.start).sort();
  const ends = ranges.map((r) => r.end).sort();
  const feeLine = lines.find((l) => /^דמי השתתפות\s*:/.test(l));
  const fee = feeLine ? Number((feeLine.match(/(\d+)/) ?? [])[1] ?? 0) : 0;
  const venues = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^שם המועדון\s*:/.test(lines[i])) {
      venues.push({ club: lines[i].replace(/^[^:]*:\s*/, ''), address: (lines[i + 1] ?? '').replace(/^כתובת\s*:\s*/, '') });
    }
  }
  // category pages and the heading they sit under
  const heads = [['qualifying', /הגרלות המוקדמות/g], ['finals', /הגרלות בית הגמר/g]];
  const found = [];
  const re = /SchedulesForTennisCompetition\/(\d+)\?seasonId=(\d+)/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    let section = 'main', best = -1;
    for (const [key, rx] of heads) {
      rx.lastIndex = 0;
      let h; let last = -1;
      while ((h = rx.exec(html)) && h.index < m.index) last = h.index;
      if (last > best) { best = last; section = key; }
    }
    found.push({ id: m[1], seasonId: m[2], section });
  }
  return {
    url, name,
    start: starts[0] ?? null, end: ends[ends.length - 1] ?? null, feeShekel: fee, venues,
    categories: found,
    isDoubles: /זוגות/.test(name),
  };
}

const SCORE_SET = /^(\d{1,2})[-:](\d{1,2})$/;

/** "6-3 7-5" | "2-6 6-4 7-10" | "6-6 Ret" -> { sets, retired, walkover }. A third set to 10 is a super tiebreak. */
export function parseScore(text) {
  const t = (text ?? '').trim();
  const retired = /ret/i.test(t);
  const walkover = /w\.?o|וו|walk/i.test(t) && !/\d-\d/.test(t);
  const sets = [];
  for (const part of t.split(/\s+/)) {
    const m = part.match(SCORE_SET);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]);
    const superTb = sets.length === 2 && (a >= 10 || b >= 10);
    sets.push(superTb ? { a, b, superTb: true } : { a, b });
  }
  return { sets, retired, walkover };
}

/** "name - club" -> { name, club } (splits on the first " - "). */
export function parsePlayer(cell) {
  const t = (cell ?? '').trim();
  const i = t.indexOf(' - ');
  return i < 0 ? { name: t, club: '' } : { name: t.slice(0, i).trim(), club: t.slice(i + 3).trim() };
}

export function genderOf(categoryName) {
  if (/בנות|נשים/.test(categoryName)) return 'FEMALE';
  if (/בנים|גברים/.test(categoryName)) return 'MALE';
  return 'OPEN';
}
export const ageOf = (categoryName) => { const m = categoryName.match(/(\d{2})/); return m ? Number(m[1]) : null; };

/** Category page -> { competition, category, matches[] } */
export function parseCategoryPage(html) {
  const title = strip((html.match(/([^<>]{3,200}\/[^<>]{2,80}-\s*לוח משחקים ותוצאות)/) ?? [])[1] ?? '');
  const tm = title.match(/^(.*?)\s*\/\s*(.+?)\s*-\s*לוח משחקים ותוצאות$/);
  const matches = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const c = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(strip);
    if (c.length < 10) continue;
    const when = c[4].match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!when || !c[7] || !c[9]) continue;
    const sc = parseScore(c[11] ?? '');
    matches.push({
      done: c[0] === 'נגמר', venue: c[1], stage: c[2], slot: c[3],
      start: `${when[3]}-${when[2]}-${when[1]}T${when[4]}:${when[5]}`, kind: c[5] === 'NB' ? 'NB' : c[5] === 'St' ? 'St' : '',
      a: parsePlayer(c[7]), b: parsePlayer(c[9]), score: c[11] ?? '', ...sc,
    });
  }
  return { competition: tm?.[1] ?? '', category: tm?.[2] ?? title, matches };
}

/** Round number for a knockout slot label "a - b": b is the round size (2 = final). a > 1 is a classification match. */
export function koRound(slot) {
  const m = slot.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const size = Number(m[2]);
  return { place: Number(m[1]), size, depthFromFinal: Math.max(0, Math.round(Math.log2(size)) - 1) };
}

/** Israel local time "YYYY-MM-DDTHH:MM" -> ISO UTC (handles daylight saving). */
export function israelToUtc(local) {
  const [d, t] = local.split('T');
  const guess = new Date(`${d}T${t}:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
  const asIsrael = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  const offset = asIsrael - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}
