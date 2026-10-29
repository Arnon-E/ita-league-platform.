// Tennis Europe tournaments outside Israel (te.tournamentsoftware.com), for the site's "abroad" page: when and where junior tournaments are held,
// their level, until when to enter, the entry fee and what the organizer offers. Name, place, dates and conditions only; no draws or players.
//
//   node scripts/loglig-sync/abroad.mjs                      # dry run: lists what would be sent (next 180 days)
//   node scripts/loglig-sync/abroad.mjs --days 365 --limit 20
//   node scripts/loglig-sync/abroad.mjs --push --url <site>  # CRON_SECRET from the environment
//
// Read-only against Tennis Europe: the search page's own POST (20 results a page), then each upcoming event's page and fact sheet (~1.5 s each).
import { session } from './tournamentsoftware.mjs';

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
    fee: between('Entry Fee', 'Draws:|Hospitality:|Category:').replace(/^none$/i, ''),
    hospitality: between('Hospitality', 'Entry Fee:|Draws:|Accommodation:'),
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
  const found = (await searchTournaments(ts, today, to, log)).filter((e) => !/israel/i.test(e.country));
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

if (process.argv[1] && process.argv[1].endsWith('abroad.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const { events, until } = await readAbroad({ days: Number(opt('--days', 180)), limit: Number(opt('--limit', Infinity)) });
  for (const e of events) console.log(`${e.start}..${e.end}  ${e.country.padEnd(14)} ${e.city.padEnd(18)} ${String(e.age ?? '').padEnd(3)} ${e.category.padEnd(12)} ${(e.entryDeadline ?? '').slice(0, 10).padEnd(11)} ${e.fee.slice(0, 28).padEnd(28)} ${e.name}`);
  console.log(`${events.length} tournament(s) abroad`);
  if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
  const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!base || !process.env.CRON_SECRET) { console.error('--push needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'abroad', events, until }) });
  console.log(`push abroad: ${res.status} ${(await res.text()).slice(0, 200)}`);
  process.exit(res.ok ? 0 : 1);
}
