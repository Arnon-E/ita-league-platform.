// Tennis Europe tournaments outside Israel (te.tournamentsoftware.com), for the site's "abroad" page: when and where junior tournaments are held,
// their level, until when to enter, the entry fee and what the organizer offers. Name, place, dates and conditions only; no draws or players.
//
//   node scripts/loglig-sync/abroad.mjs                      # dry run: lists what would be sent (next 180 days)
//   node scripts/loglig-sync/abroad.mjs --days 365 --limit 20
//   node scripts/loglig-sync/abroad.mjs --push --url <site>  # CRON_SECRET from the environment
//
// Read-only against Tennis Europe: the search page's own POST (20 results a page), then each upcoming event's page and fact sheet (~1.5 s each).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPlayer, matchDays, parseDayMatches, parseDraws, session } from './tournamentsoftware.mjs';
export { matchDays };
import { readAcceptance } from './te.mjs';

export const TE = 'https://te.tournamentsoftware.com';
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const MONTH = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** One page of search results -> [{ id, name, venue, city, country, start, end, surface, category, age, closed }]. */
export function parseSearch(html) {
  const out = [];
  for (const block of html.split(/<li class="list__item">\s*<div class="media">/).slice(1)) {
    const id = block.match(/\/sport\/tournament\?id=([0-9A-Fa-f-]{36})/)?.[1];
    const name = block.match(/<span class="nav-link__value">([\s\S]*?)<\/span>\s*<\/a>\s*<\/h4>/)?.[1];
    const place = block.match(/icon-marker[\s\S]*?<span class="nav-link__value">([\s\S]*?)<\/span>/)?.[1];
    const dates = [...block.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
    if (!id || !name || !place || dates.length < 2) continue;
    const [venue, where = ''] = decode(place.replace(/<img[^>]*>/g, '')).replace(/\s+/g, ' ').trim().split(/\s*\|\s*/);
    const comma = where.lastIndexOf(',');
    const tags = [...block.matchAll(/<span class="tag[^"]*">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    const surface = text(block.match(/icon-court[\s\S]*?<span class="nav-link__value">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const title = text(name);
    out.push({
      id: id.toUpperCase(), name: title.replace(/\s*\(closed event\)\s*/i, '').trim(), venue: venue ?? '', city: (comma < 0 ? where : where.slice(0, comma)).trim(), country: (comma < 0 ? '' : where.slice(comma + 1)).trim(),
      start: dates[0], end: dates[1], surface, category: tags.find((t) => !/^\d+\s*&?U/i.test(t)) ?? '', age: Number(tags.find((t) => /^\d+\s*&?U/i.test(t))?.match(/\d+/)?.[0]) || null, closed: /closed event/i.test(title),
    });
  }
  return out;
}

/** "Entry opens Mon 7 Sep 00:00 GMT Entry deadline Tue 6 Oct 14:00 GMT Withdrawal deadline Tue 20 Oct 14:00 GMT" (from an event's page text) -> ISO instants. */
export function parseEntryDates(pageText, startIso) {
  const startYear = Number(startIso.slice(0, 4)), startMonth = Number(startIso.slice(5, 7));
  const one = (label) => {
    const m = pageText.match(new RegExp(`${label} \\w{3} (\\d{1,2}) (\\w{3}) (\\d{2}):(\\d{2}) GMT`));
    const mo = m && MONTH[m[2]];
    if (!m || !mo) return null;
    // the page gives no year: entries open and close before the event starts, so a later month than the start month belongs to the year before
    const year = mo > startMonth + 1 ? startYear - 1 : startYear;
    return `${year}-${pad(mo)}-${pad(Number(m[1]))}T${m[3]}:${m[4]}:00.000Z`;
  };
  return { entryOpens: one('Entry opens'), entryDeadline: one('Entry deadline'), withdrawalDeadline: one('Withdrawal deadline') };
}

/** The fact sheet's conditions: fee, hospitality and whether the courts are indoors. */
export function parseFactsheet(html) {
  const t = text(html);
  const between = (a, b) => t.match(new RegExp(`${a}:\\s*(.*?)\\s*(?:${b})`))?.[1]?.trim() ?? '';
  const loc = t.match(/Location type:\s*(\w+)/)?.[1];
  return {
    fee: between('Entry Fee', 'Draws:|Hospitality:|Category:').replace(/^(none|n\/?a|-+)$/i, ''),
    // organizers type "None", "-" or "n/a" when they offer nothing: that is an empty field, not a condition worth showing
    hospitality: between('Hospitality', 'Entry Fee:|Draws:|Accommodation:').replace(/^(none|n\/?a|no|nil|-+|\.+)$/i, ''),
    indoor: loc ? /^indoor/i.test(loc) : null,
  };
}

const ajax = { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' };

/** Every listed tournament starting from `from` to `to` (ISO dates): the search page's own paging (20 results a page). */
export async function searchTournaments(ts, from, to, log = console.log) {
  const page = await ts.get(`/find?StartDate=${from}&EndDate=${to}&StatusFilterID=0`);
  const form = page.match(/<form[^>]*action="\/find\/tournament\/DoSearch"[\s\S]*?<\/form>/i)?.[0] ?? '';
  const body = new URLSearchParams();
  for (const m of form.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0], name = tag.match(/name="([^"]+)"/)?.[1], type = tag.match(/type="([^"]+)"/)?.[1] ?? 'text';
    if (name && !['checkbox', 'radio', 'submit', 'button'].includes(type)) body.set(name, tag.match(/value="([^"]*)"/)?.[1] ?? '');
  }
  body.set('TournamentFilter.StartDate', from); body.set('TournamentFilter.EndDate', to); body.set('TournamentExtendedFilter.StatusFilterID', '0');
  const all = new Map();
  for (let p = 1; p <= 40; p++) {
    body.set('Page', String(p));
    if (p > 1) body.set('LoadMoreResults', 'LoadMoreResults');
    const html = await ts.get('/find/tournament/DoSearch', { method: 'POST', headers: ajax, body });
    const got = parseSearch(html);
    for (const e of got) all.set(e.id, e);
    if (got.length < 20) break;
  }
  log(`  search ${from}..${to}: ${all.size} tournaments`);
  return [...all.values()];
}

/** The events a player outside Israel's own competitions would care about, with entry dates and conditions. */
export async function readAbroad({ days = 180, limit = Infinity, log = console.log } = {}) {
  const ts = session(TE);
  const today = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  // from a week back: what ended in the last week is listed too (its results are still read)
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  // Israeli events too: their page here has the draws and results (they are also competitions on the site, with details and who is accepted only)
  const found = await searchTournaments(ts, from, to, log);
  const events = [];
  for (const e of found.slice(0, limit)) {
    let extra = { entryOpens: null, entryDeadline: null, withdrawalDeadline: null, fee: '', hospitality: '', indoor: null };
    try {
      extra = { ...extra, ...parseEntryDates(text(await ts.get(`/tournament/${e.id.toLowerCase()}`)), e.start) };
      extra = { ...extra, ...parseFactsheet(await ts.get(`/sport/factsheet.aspx?id=${e.id}`)) };
    } catch (err) { log(`  details failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
    events.push({ ...e, ...extra, url: `${TE}/tournament/${e.id.toLowerCase()}` });
  }
  return { events, until: to };
}

/**
 * A draw's knockout tree (the page's own GetDrawContent): every round is a slide, its matches in the order of the tree, empty rows where the players
 * are not known yet. -> [[{ a: { names, cc, won }, b: { names, cc, won }, sets, date }]], first round first.
 */
export function parseDrawContent(html) {
  return html.split(/<swiper-slide[^>]*>/).slice(1).map((slide) => slide.split('</swiper-slide>')[0]
    .split(/<div class="match(?=[ "])/).slice(1)
    .map((block) => {
      const rows = block.split(/<div class="match__row(?=[ "])/).slice(1).map((r) => ({
        names: [...r.matchAll(/data-player-id="[^"]*"[^>]*>\s*<span class="nav-link__value">([\s\S]*?)<\/span>/g)].map((x) => cleanPlayer(x[1])).filter(Boolean),
        cc: [...r.matchAll(/data-nationality-id="([A-Z]{3})"/g)].map((x) => x[1]),
        won: /^[^>]*has-won/.test(r),
      }));
      const sets = [...block.matchAll(/<ul class="points">([\s\S]*?)<\/ul>/g)].map((x) => [...x[1].matchAll(/<li[^>]*>\s*(\d+)\s*<\/li>/g)].map((c) => Number(c[1]))).filter((p) => p.length === 2);
      const date = text(block.match(/match__footer[\s\S]*?nav-link__value">([^<]*)</)?.[1] ?? '');
      return rows.length >= 2 ? { a: rows[0], b: rows[1], sets, date } : null;
    }).filter(Boolean)).filter((round) => round.length);
}

/**
 * The draws of an event in which an Israeli player is: [{ n, name, kind: 'KO' | 'RR', rounds }] (a group's rounds are its round robin days; its table is worked out
 * from the matches on the page).
 */
export async function readEventDraws(ts, id) {
  const list = await ts.get(`/sport/draws.aspx?id=${id}`);
  const links = [...list.matchAll(/href="draw\.aspx\?id=[^"]*&(?:amp;)?draw=(\d+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ n: Number(m[1]), name: text(m[2]) }));
  if (!links.length) return [];
  const types = new Map(parseDraws(list).map((d) => [d.name, d.type]));
  await ts.get(`/tournament/${id.toLowerCase()}/Draw/${links[0].n}`); // opens the draw page first, like a browser does
  const out = [];
  for (const l of links) {
    const html = await ts.get(`/tournament/${id.toLowerCase()}/Draw/${l.n}/GetDrawContent?tabindex=1`, { method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
    const rounds = parseDrawContent(html);
    if (rounds.some((round) => round.some((m) => [...m.a.cc, ...m.b.cc].includes('ISR')))) out.push({ n: l.n, name: l.name, kind: /round robin/i.test(types.get(l.name) ?? '') ? 'RR' : 'KO', rounds });
  }
  return out;
}

const isoDay = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

/**
 * The matches of Israeli players ("ISR" flag on either side) at one event: on the given days (YYYYMMDD), or on every day its match page lists.
 * Returns { id, days: [ISO day read], matches }. The page is only read when no days are given.
 */
export async function readIsraeliMatches(ts, id, onlyDays) {
  const base = `/tournament/${id.toLowerCase()}`;
  const days = onlyDays ?? matchDays(await ts.get(`${base}/Matches`));
  const matches = [];
  for (const d of days) {
    const html = await ts.get(`${base}/Matches/MatchesInDay`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }, body: new URLSearchParams({ Date: d }) });
    for (const m of parseDayMatches(html, isoDay(d))) {
      if (![...m.a.cc, ...m.b.cc].includes('ISR')) continue;
      matches.push({ day: m.day, draw: m.draw, stage: m.stage, court: m.court, time: m.time, a: { names: m.a.names, cc: m.a.cc, won: m.a.won, msg: m.a.msg }, b: { names: m.b.names, cc: m.b.cc, won: m.b.won, msg: m.b.msg }, sets: m.sets });
    }
  }
  return { id: id.toUpperCase(), days: days.map(isoDay), matches };
}

const post = async (base, secret, body) => {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 200) };
};

/**
 * The Israelis on the acceptance lists of the events that have not ended and whose entry deadline has passed (the list is out then): one page and one more
 * request per event; only the Israeli rows are kept and sent.
 */
async function sendAcceptance(events, base, secret) {
  const ts = session(TE);
  const today = new Date().toISOString().slice(0, 10);
  const wanted = events.filter((e) => e.end >= today && e.entryDeadline && Date.parse(e.entryDeadline) < Date.now());
  const out = [];
  for (const e of wanted) {
    try {
      const acceptance = (await readAcceptance(ts, e.id)).map((a) => ({ ...a, players: a.players.filter((p) => /israel/i.test(p.nation)) })).filter((a) => a.players.length);
      if (acceptance.length) out.push({ id: e.id, acceptance });
    } catch (err) { console.log(`  acceptance list failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
  }
  console.log(`${out.length} of ${wanted.length} event(s) with a published list have Israelis accepted (${out.reduce((n, e) => n + e.acceptance.reduce((m, a) => m + a.players.length, 0), 0)} entries)`);
  for (let i = 0; i < out.length; i += 10) {
    const r = await post(base, secret, { kind: 'abroad-acceptance', events: out.slice(i, i + 10) });
    console.log(`push abroad-acceptance: ${r.status} ${r.text}`);
  }
}

/** Events that are on today (or ended in the last week): their Israeli players' matches, sent in small batches. Events with none are not sent. */
async function sendResults(events, base, secret, { liveOnly = false } = {}) {
  const ts = session(TE);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const wanted = events.filter((e) => e.start <= today && (liveOnly ? e.end >= today : e.end >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)));
  const out = [];
  for (const e of wanted) {
    try {
      // the hourly refresh reads only today and yesterday of the days the event runs; the daily one reads them all
      const only = liveOnly ? [yesterday, today].filter((d) => d >= e.start && d <= e.end).map((d) => d.replace(/-/g, '')) : undefined;
      const r = await readIsraeliMatches(ts, e.id, only);
      if (r.matches.length) {
        // the trees of the draws the Israelis are in (one failing page must not lose the matches)
        try { r.draws = await readEventDraws(ts, e.id); } catch (err) { console.log(`  draws failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
        out.push(r);
      }
    } catch (err) { console.log(`  results failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
  }
  console.log(`${out.length} of ${wanted.length} running or recent event(s) have matches of Israeli players (${out.reduce((n, r) => n + r.matches.length, 0)} matches)`);
  for (let i = 0; i < out.length; i += 10) {
    const r = await post(base, secret, { kind: 'abroad-results', results: out.slice(i, i + 10) });
    console.log(`push abroad-results: ${r.status} ${r.text}`);
  }
}

/** "Last changed Friday, 30 October 2026 14:24 (GMT +01:00)" on an event's main page: when its organizer last saved anything there (entries, draws, results). */
export const parseLastChanged = (html) => text(html).match(/Last changed ([^(]*\(GMT [^)]*\))/)?.[1]?.trim() ?? null;

/**
 * The hourly/ten-minute refresh of events that are on. Each event's main page is looked at first (one small request) and its matches only when the stamp changed since
 * the last look; `state` remembers the stamp and whether the event has Israelis. Events with Israeli matches are sent with their draws.
 */
async function liveRefresh(ts, events, state, base, secret) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const out = [];
  let looked = 0;
  for (const e of events) {
    const known = state.events[e.id] ?? { changed: null, israelis: false };
    try {
      const changed = parseLastChanged(await ts.get(`/tournament/${e.id.toLowerCase()}`));
      looked++;
      state.events[e.id] = { ...known, name: e.name, start: e.start, end: e.end };
      if (changed && changed === known.changed) continue; // nothing was saved since the last look
      const days = [yesterday, today].filter((d) => d >= e.start && d <= e.end).map((d) => d.replace(/-/g, ''));
      const r = await readIsraeliMatches(ts, e.id, days);
      state.events[e.id].changed = changed;
      state.events[e.id].israelis = known.israelis || r.matches.length > 0;
      if (!r.matches.length) continue;
      try { r.draws = await readEventDraws(ts, e.id); } catch (err) { console.log(`  draws failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
      out.push(r);
    } catch (err) { console.log(`  refresh failed for ${e.name}: ${String(err.message).slice(0, 60)}`); }
  }
  console.log(`live: looked at ${looked} event(s), ${out.length} with news for Israeli players`);
  for (let i = 0; i < out.length; i += 10) {
    const r = await post(base, secret, { kind: 'abroad-results', results: out.slice(i, i + 10) });
    console.log(`push abroad-results: ${r.status} ${r.text}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('abroad.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  const push = args.includes('--push');
  if (push && (!base || !process.env.CRON_SECRET)) { console.error('--push needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }

  if (args.includes('--live')) {
    // started every 10 minutes by the rosters job, in the daytime (Israel time). Every run looks at the events known to have Israeli players (one small request each;
    // matches are read only when the event's "last changed" moved); about once an hour it also looks at every event that is on, to find new ones
    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }));
    const out = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.loglig-dump');
    if (!args.includes('--force') && (hour < 8 || hour >= 22)) { console.log('abroad live: outside 8:00-22:00 (Israel time), nothing to do'); process.exit(0); }
    mkdirSync(out, { recursive: true });
    const stateFile = path.join(out, 'abroad-live-state.json');
    let state = { scannedAt: null, events: {} };
    try { if (existsSync(stateFile)) state = { ...state, ...JSON.parse(readFileSync(stateFile, 'utf8')) }; } catch { /* a damaged file: start again */ }
    const today = new Date().toISOString().slice(0, 10);
    const full = args.includes('--force') || !state.scannedAt || Date.now() - Date.parse(state.scannedAt) > 50 * 60e3;
    const ts = session(TE);
    const events = full
      ? (await searchTournaments(ts, today, today)).filter((e) => e.start <= today && e.end >= today)
      : Object.entries(state.events).filter(([, v]) => v.israelis && v.start <= today && v.end >= today).map(([id, v]) => ({ id, name: v.name, start: v.start, end: v.end }));
    if (!push) { console.log(`${events.length} event(s) to look at (${full ? 'full scan' : 'events with Israelis'}); dry run: nothing read or sent`); process.exit(0); }
    if (full) state.scannedAt = new Date().toISOString();
    await liveRefresh(ts, events, state, base, process.env.CRON_SECRET);
    // forget events that are over
    for (const [id, v] of Object.entries(state.events)) if (v.end < new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)) delete state.events[id];
    writeFileSync(stateFile, JSON.stringify(state));
    process.exit(0);
  }

  const { events, until } = await readAbroad({ days: Number(opt('--days', 180)), limit: Number(opt('--limit', Infinity)) });
  for (const e of events) console.log(`${e.start}..${e.end}  ${e.country.padEnd(14)} ${e.city.padEnd(18)} ${String(e.age ?? '').padEnd(3)} ${e.category.padEnd(12)} ${(e.entryDeadline ?? '').slice(0, 10).padEnd(11)} ${e.fee.slice(0, 28).padEnd(28)} ${e.name}`);
  console.log(`${events.length} tournament(s) abroad`);
  if (!push) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
  const r = await post(base, process.env.CRON_SECRET, { kind: 'abroad', circuit: 'TE', events, until });
  console.log(`push abroad: ${r.status} ${r.text}`);
  if (!r.ok) process.exit(1);
  if (!args.includes('--no-results')) await sendResults(events, base, process.env.CRON_SECRET);
  if (!args.includes('--no-acceptance')) await sendAcceptance(events, base, process.env.CRON_SECRET);
}
