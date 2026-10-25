// Masters competitions (Israel Masters Tennis Tour) keep their draws, schedules and results on tournamentsoftware.com, not on Loglig.
// Pure parsers (no network, unit tested) and a small reader for the public pages. Read-only: plain GETs, one POST per match day (the page's own date picker).
import { israelToUtc } from './parse.mjs';

export const TS = 'https://www.tournamentsoftware.com';
/** The organization page of the Israel Masters Tennis Tour: lists its tournaments year by year. */
export const ORG_URL = `${TS}/find.aspx?a=7&q=65f3e4f8-5567-42af-846f-0fc38adaf295`;

const UA = 'Mozilla/5.0 (ITA data mirror, read-only)';
const decode = (s) => s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const text = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');

/** "ינון 0527773432 סגל" -> "ינון סגל": the page shows a player as first name, the phone they typed at registration, then the last name. Phones and seed marks ("[1]") are never kept. */
export function cleanPlayer(raw) {
  return decode(raw)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/(?:\+?972[-\s]?|0)\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/g, ' ')
    .replace(/\b\d{7,}\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const GENDER_WORD = { MS: 'גברים', WS: 'נשים', MD: 'זוגות גברים', WD: 'זוגות נשים', XD: 'זוגות מעורבים' };
/** "MS 40 (B)" -> { name: 'גברים 40 (B)', gender: 'MALE', doubles: false }; "XD (A)" -> 'זוגות מעורבים (A)'. */
export function eventInfo(code) {
  const m = code.trim().match(/^(MS|WS|MD|WD|XD)\s*([\d]+(?:\s*-\s*[\d]+)?)?\s*(\([A-Za-z0-9]+\))?/);
  if (!m) return null;
  const kind = m[1];
  const name = [GENDER_WORD[kind], m[2]?.replace(/\s+/g, ''), m[3]].filter(Boolean).join(' ');
  return { code: code.trim(), name, kind, doubles: kind.endsWith('D'), gender: kind === 'XD' ? 'OPEN' : kind[0] === 'M' ? 'MALE' : 'FEMALE' };
}

/** The organization's tournaments: [{ id, name, start, end }] (dates as YYYY-MM-DD, the year taken from the heading above the row). */
export function parseOrgList(html) {
  const out = [];
  let year = 0;
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const y = row.match(/<th[^>]*colspan[^>]*>\s*(\d{4})\s*<\/th>/);
    if (y) { year = Number(y[1]); continue; }
    const d = text(row).match(/(\d{2})\/(\d{2}) to (\d{2})\/(\d{2})/);
    const a = row.match(/tournament\.aspx\?id=([0-9A-Fa-f-]{36})[^>]*>([\s\S]*?)<\/a>/);
    if (!d || !a || !year) continue;
    const endYear = Number(d[3]) < Number(d[1]) ? year + 1 : year;
    out.push({ id: a[1].toUpperCase(), name: text(a[2]), start: `${year}-${d[1]}-${d[2]}`, end: `${endYear}-${d[3]}-${d[4]}` });
  }
  return out;
}

/** The draws page: [{ name, size, type }] ("Elimination" / "Round Robin"). */
export function parseDraws(html) {
  const out = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    if (!/draw\.aspx\?/.test(row)) continue;
    const cells = (row.match(/<td[\s\S]*?<\/td>/g) ?? []).map(text);
    if (cells[0]) out.push({ name: cells[0], size: Number(cells[1]) || 0, type: cells[2] ?? '' });
  }
  return out;
}

const DEPTH = { Final: 0, 'Semi final': 1, 'Quarter final': 2, 'Round of 16': 3, 'Round of 32': 4, 'Round of 64': 5 };

/** One match-day fragment -> raw matches (names cleaned, scores per set, who won). */
export function parseDayMatches(html, day) {
  const out = [];
  const tok = /<h5[^>]*match-group__header[^>]*>([\s\S]*?)<\/h5>|<div class="match-group__subheader">([\s\S]*?)<\/div>|<div class="match match--list">/g;
  const marks = [...html.matchAll(tok)];
  let court = '', time = '', kindText = '';
  marks.forEach((m, i) => {
    if (m[1] !== undefined) { court = text(m[1].replace(/<span>[\s\S]*?<\/span>/, '')); return; }
    if (m[2] !== undefined) { time = (m[2].match(/datetime="(\d{1,2}:\d{2})"/) ?? [])[1] ?? ''; kindText = text(m[2]); return; }
    const block = html.slice(m.index, marks[i + 1]?.index ?? html.length);
    const titles = [...block.matchAll(/<li class="match__header-title-item">([\s\S]*?)<\/li>/g)].map((x) => text(x[1]));
    const body = (block.split('class="match__body"')[1] ?? '').split(/class="match__result"|class="match__footer"/)[0];
    const rows = body.split(/<div class="match__row(?=[ "])/).slice(1).map((r) => ({
      names: [...r.matchAll(/data-player-id="[^"]*"[^>]*>\s*<span class="nav-link__value">([\s\S]*?)<\/span>/g)].map((x) => cleanPlayer(x[1])).filter(Boolean),
      won: /^[^>]*has-won/.test(r),
      msg: (r.match(/match__message">([^<]*)</) ?? [])[1]?.trim() ?? '',
    }));
    const sets = [...block.matchAll(/<ul class="points">([\s\S]*?)<\/ul>/g)].map((x) => [...x[1].matchAll(/<li[^>]*>\s*(\d+)\s*<\/li>/g)].map((c) => Number(c[1]))).filter((p) => p.length === 2);
    if (rows.length < 2 || !titles.length) return;
    out.push({ draw: titles[0], stage: titles[1] ?? '', day, court, time, kindText, a: rows[0], b: rows[1], sets });
  });
  return out;
}

/** Raw matches of a whole tournament + its draws list -> { categories, doubles } in the shape the competition import takes. */
export function buildTsCompetition(raw, draws) {
  const typeOf = new Map(draws.map((d) => [d.name, d.type]));
  const byEvent = new Map();
  for (const r of raw) {
    const event = r.draw.replace(/\s+-\s+Group\s+\d+$/i, '');
    const info = eventInfo(event);
    if (!info) continue;
    const list = byEvent.get(event) ?? { info, rows: [] };
    list.rows.push(r);
    byEvent.set(event, list);
  }
  const categories = [], doubles = [];
  for (const { info, rows } of byEvent.values()) {
    const depths = rows.filter((r) => r.stage in DEPTH).map((r) => DEPTH[r.stage]);
    const maxDepth = depths.length ? Math.max(...depths) : 0;
    const ms = rows.map((r, i) => {
      const g = r.draw.match(/Group\s+(\d+)$/i);
      const robin = !!g || (typeOf.get(r.draw) ?? '').toLowerCase().includes('round robin');
      const roundNo = Number((r.stage.match(/^Round (\d+)$/) ?? [])[1]) || 1;
      const sets = r.sets.map(([x, y], k) => ({ a: x, b: y, ...(k === 2 && Math.max(x, y) >= 10 ? { superTb: true } : {}) }));
      const nb = /not before/i.test(r.kindText);
      const done = r.a.won || r.b.won;
      return {
        stage: robin ? 'GROUP' : 'KO', ...(robin ? { group: `בית ${g ? g[1] : 1}` } : {}),
        round: robin ? roundNo : r.stage in DEPTH ? maxDepth - DEPTH[r.stage] + 1 : roundNo,
        place: 1, order: i, start: israelToUtc(`${r.day}T${r.time || '09:00'}`), kind: nb ? 'NB' : /starting at/i.test(r.kindText) ? 'St' : '', venue: r.court.replace(/^Court\s+/i, 'מגרש '), done,
        a: { name: r.a.names.join(' / '), club: '' }, b: { name: r.b.names.join(' / '), club: '' },
        sets: done ? sets : [], ...(r.a.won ? { winner: 'a' } : r.b.won ? { winner: 'b' } : {}), retired: [r.a.msg, r.b.msg].some((x) => /retired/i.test(x)), walkover: [r.a.msg, r.b.msg].some((x) => /walkover/i.test(x)),
      };
    });
    if (info.doubles) doubles.push({ name: info.name, source: `ts:${info.code}`, gender: info.gender, age: null, matches: ms });
    else categories.push({ name: info.name, source: `ts:${info.code}`, gender: info.gender, age: null, format: ms.some((m) => m.stage === 'GROUP') ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', matches: ms });
  }
  return { categories, doubles };
}

// ---- network -------------------------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A session that has accepted only the strictly necessary cookies (the site shows a cookie wall otherwise). */
export function session() {
  const jar = new Map();
  const keep = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  async function get(url, o = {}, hops = 0) {
    await sleep(700);
    const r = await fetch(url, { redirect: 'manual', ...o, headers: { 'user-agent': UA, 'accept-language': 'en', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(o.headers ?? {}) } });
    keep(r);
    if (r.status >= 300 && r.status < 400 && hops < 6) return get(new URL(r.headers.get('location'), url).href, {}, hops + 1);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.text();
  }
  let ready = false;
  return {
    async get(path, o) {
      if (!ready) {
        ready = true;
        const ret = '/';
        await get(`${TS}/cookiewall/?returnurl=${encodeURIComponent(ret)}`);
        const body = new URLSearchParams({ ReturnUrl: ret, SettingsOpen: 'false' }); body.append('CookiePurposes', '1');
        await get(`${TS}/cookiewall/Save`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      }
      return get(path.startsWith('http') ? path : TS + path, o);
    },
  };
}

/** The matches scheduled on one day (YYYY-MM-DD) of a tournament: the page's own date picker posts the day. */
export async function readDay(ts, id, ymd) {
  const d = ymd.replace(/-/g, '');
  const body = new URLSearchParams({ Date: d });
  const html = await ts.get(`/tournament/${id.toLowerCase()}/Matches/MatchesInDay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }, body });
  return parseDayMatches(html, ymd);
}

/** The draws of a tournament: [{ name, size, type }]. */
export async function readDraws(ts, id) {
  return parseDraws(await ts.get(`/sport/draws.aspx?id=${id.toLowerCase()}`));
}

/** Every match of one tournament (one request per match day) and its draws: { raw, draws, days }. */
export async function readTournament(ts, id) {
  const page = await ts.get(`/tournament/${id.toLowerCase()}/Matches`);
  const days = [...page.matchAll(/<option[^>]*value="(\d{8})"/g)].map((m) => m[1]);
  const raw = [];
  for (const d of days) raw.push(...(await readDay(ts, id, `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`)));
  return { raw, draws: await readDraws(ts, id), days };
}

/** City of a Masters tournament, English on tournamentsoftware.com and Hebrew on ita.co.il. */
export const TS_CITIES = [['Akko', 'עכו'], ['Jerusalem', 'ירושלים'], ['Kiryat Motzkin', 'מוצקין'], ['Eilat', 'אילת'], ['Ashkelon', 'אשקלון'], ['Raanana', 'רעננה'], ['Finals', 'סוף שנה'], ['Maccabiah', 'מכביה']];
/** Is this ita.co.il competition (or its name on the site) the tournamentsoftware.com tournament `tsName`? Same city, same years, and "Open" only with "Open". */
export function sameMasters(tsName, itaName) {
  const city = TS_CITIES.find(([en]) => tsName.includes(en))?.[1];
  const years = tsName.match(/20\d\d/g) ?? [];
  return (!city || itaName.includes(city)) && years.every((y) => itaName.includes(y)) && tsName.includes('Open') === /פתוח|Open/.test(itaName);
}

/** The cached matches of a tournament with one day replaced by what the page shows now (the hourly refresh reads only the current day). */
export function replaceDay(raw, day, fresh) {
  return [...raw.filter((r) => r.day !== day), ...fresh];
}
