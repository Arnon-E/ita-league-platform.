// Tennis Europe Junior Tour events held in Israel (closed events for Israeli players, organized by the federation).
// Their pages live on te.tournamentsoftware.com, the same software as the Masters tour: details, draws, schedule and results.
//
//   node scripts/loglig-sync/te.mjs                       # dry run: lists the Israeli events with their dates
//   node scripts/loglig-sync/te.mjs --id <tournament id>  # one event, even if the year's list does not show it
//
// Also runs inside `competitions.mjs --list all` (documents are pushed with the other competitions). Read-only: plain GETs and the page's own POSTs.
import { buildTsCompetition, readTournament, session } from './tournamentsoftware.mjs';

export const TE = 'https://te.tournamentsoftware.com';
/** Any Israeli Tennis Europe event: its "other events" tab lists the year's events, and the Israeli ones are picked from there. */
export const SEED = '9D8C8CD6-8183-4CD6-BBC1-ACA9E07269A8';

const decode = (s) => s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const MONTH = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
/** Israeli cities as Tennis Europe spells them (upper case, with street names) -> the Hebrew the site uses. */
const CITY_HE = [['TEL AVIV', 'תל אביב'], ['HAIFA', 'חיפה'], ['JERUSALEM', 'ירושלים'], ['RAANANA', 'רעננה'], ['HERZLIYA', 'הרצליה'], ['RAMAT GAN', 'רמת גן'], ['NETANYA', 'נתניה'], ['BEER SHEVA', 'באר שבע'], ['ASHKELON', 'אשקלון'], ['EILAT', 'אילת'], ['KFAR SABA', 'כפר סבא'], ['CAESAREA', 'קיסריה'], ['JAFFA', 'יפו'], ['RAMAT HASHARON', 'רמת השרון'], ['RAMAT-HASHARON', 'רמת השרון'], ['YAFO', 'יפו']];

/** Hebrew name of an Israeli city mentioned in any of the texts ("Ramat Hasharon", "TE 14 - HAIFA"), or undefined. */
export const hebrewCity = (...texts) => CITY_HE.find(([en]) => texts.some((t) => String(t ?? '').toUpperCase().includes(en)))?.[1];

/** The year's events from the "other events" tab: [{ id, title }]. */
export function parseOtherEvents(html) {
  const seen = new Set();
  return [...html.matchAll(/<a[^>]+href="\/tournament\/([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ id: m[1].toUpperCase(), title: text(m[2]) }))
    .filter((x) => x.title && !seen.has(x.id) && seen.add(x.id));
}

/**
 * One event's main page -> { title, closed, venue, city, country, start, end, entries, category, contact } (dates as ISO).
 * The page text reads "Menu TE 14 - HAIFA (closed event) Log In TE 14 - HAIFA (closed event) ITC HAIFA | Haifa, Israel 2 Nov to 8 Nov Category 2 ...".
 */
export function parseEvent(html, year) {
  const t = text(html);
  const m = t.match(/Menu (.+?) Log In \1 (.+?) \| (.+?), ([A-Za-z .'-]+?) (\d{1,2}) (\w{3}) to (\d{1,2}) (\w{3}) Category/);
  if (!m) return null;
  const key = t.match(/Tournament key\s+\S*?-(20\d\d)\b/);
  const y = Number(key?.[1] ?? year);
  const sm = MONTH[m[6]], em = MONTH[m[8]];
  if (!sm || !em) return null;
  const contact = t.match(/Contact (.+?) (\+?\d[\d ]{6,}) (\S+@\S+)/);
  return {
    title: m[1].replace(/\s*\(closed event\)/i, '').trim(), closed: /closed event/i.test(m[1]), venue: m[2].trim(), city: m[3].trim(), country: m[4].trim(),
    start: `${y}-${pad(sm)}-${pad(Number(m[5]))}`, end: `${em < sm ? y + 1 : y}-${pad(em)}-${pad(Number(m[7]))}`,
    entries: Number(t.match(/Entries (\d+)/)?.[1] ?? 0), category: Number(t.match(/\bCategory (\d)\b/)?.[1] ?? 0),
    ...(contact ? { contact: { name: contact[1].trim(), phone: contact[2].trim() } } : {}),
  };
}

/** "TE 14 - HAIFA" -> Hebrew display name "Tennis Europe U14 חיפה"; the age comes from the title, the city from the page. */
export function displayName(title, city) {
  const age = title.match(/\bTE\s*(\d{2})\b/i)?.[1];
  const he = CITY_HE.find(([en]) => title.toUpperCase().includes(en) || city.toUpperCase().includes(en))?.[1] ?? city;
  return `Tennis Europe ${age ? `U${age}` : ''} ${he}`.replace(/\s+/g, ' ').trim();
}

/**
 * One event's acceptance list (the page shows one event at a time, "BS14" / "GS14"...) -> { label, active, updated, players: [{ draw, n, name, nation, born, rank, wtn }] }.
 * The table has a header row per draw ("Main", then "(RA: 18, OA: 14 ...). Total positions: 48") followed by one row per player.
 */
export function parseAcceptance(html) {
  const label = text(html.match(/<h3>([^<]*)<\/h3>/)?.[1] ?? '').replace(/\s*Acceptance list\s*$/i, '');
  const active = Number(text(html).match(/(\d+) Active entries/)?.[1] ?? 0);
  const updated = text(html).match(/Last updated:\s*(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) GMT/);
  const players = [];
  let draw = '';
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const head = row.match(/^<tr[^>]*>\s*<th[^>]*>([^<]+)<\/th>\s*<th/);
    if (head) { draw = text(head[1]); continue; }
    const cells = (row.match(/<td[\s\S]*?<\/td>/g) ?? []).map((c) => text(c.replace(/<span class="printonly[^"]*">[\s\S]*?<\/span>/g, '')));
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    players.push({ draw, n: Number(cells[0]), name: cells[1], nation: cells[2], born: Number(cells[3]) || null, rank: cells[4].replace(/^#/, ''), wtn: cells[6] ?? '' });
  }
  return { label, active, updated: updated ? `${updated[3]}-${updated[2]}-${updated[1]}T${updated[4]}:${updated[5]}:00.000Z` : null, players };
}

/** Every event's acceptance list of a tournament: the first from the page, the others by the page's own postback (the event selector). */
export async function readAcceptance(ts, id) {
  const url = `/sport/acceptancelist.aspx?id=${id}`;
  const first = await ts.get(url);
  const select = first.match(/<select[^>]*id="[^"]*selectevent"[^>]*name="([^"]+)"[\s\S]*?<\/select>/);
  const options = select ? [...select[0].matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({ value: m[1], label: text(m[2]), selected: /selected/.test(m[0]) })) : [];
  const out = [parseAcceptance(first)];
  for (const o of options.filter((x) => !x.selected)) {
    const body = new URLSearchParams();
    for (const m of first.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = m[0].match(/name="([^"]+)"/)?.[1];
      if (name) body.set(name, decode(m[0].match(/value="([^"]*)"/)?.[1] ?? ''));
    }
    body.set('__EVENTTARGET', 'ClientFunctionHandler'); body.set('__EVENTARGUMENT', 'selectevent_IndexChanged'); body.set(select[1], o.value); body.set('SearchString', '');
    out.push(parseAcceptance(await ts.get(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })));
  }
  return out.filter((a) => a.label);
}

/** Israeli events as competition documents. `ids` adds events by id. Draws and results are filled in when the pages have them. */
export async function readTennisEurope({ year = new Date().getFullYear(), ids = [], log = console.log } = {}) {
  const ts = session(TE);
  const ajax = { 'x-requested-with': 'XMLHttpRequest' };
  const found = new Map(ids.map((i) => [i.toUpperCase(), '']));
  for (const y of [year, year + 1]) {
    try { for (const e of parseOtherEvents(await ts.get(`/tournament/${SEED}/Home/OtherEventsTabContent?year=${y}`, { headers: ajax }))) found.set(e.id, e.title); }
    catch (e) { log(`  tennis europe list ${y} failed: ${String(e.message).slice(0, 60)}`); }
  }
  found.set(SEED, found.get(SEED) ?? '');
  // only the events that look Israeli by their title get a page read; the page then confirms the country
  const candidates = [...found].filter(([id, title]) => ids.map((i) => i.toUpperCase()).includes(id) || id === SEED || /closed event|israel|haifa|tel aviv|jerusalem|raanana|herzliya/i.test(title));
  const docs = [];
  for (const [id] of candidates) {
    try {
      const ev = parseEvent(await ts.get(`/tournament/${id.toLowerCase()}`), year);
      if (!ev || !/israel/i.test(ev.country)) continue;
      const name = displayName(ev.title, ev.city);
      let acceptance = [];
      try { acceptance = (await readAcceptance(ts, id)).filter((x) => x.players.length); } catch (e) { log(`  no acceptance list for ${ev.title}: ${String(e.message).slice(0, 50)}`); }
      let categories = [], doubles = [];
      try {
        const data = await readTournament(ts, id);
        ({ categories, doubles } = buildTsCompetition(data.raw, data.draws));
      } catch (e) { log(`  no draws yet for ${ev.title}: ${String(e.message).slice(0, 50)}`); }
      docs.push({
        kind: 'competition', name, start: ev.start, end: ev.end, feeShekel: 0, level: 'INTERNATIONAL', section: 'YOUTH', sourceUrl: `${TE}/tournament/${id.toLowerCase()}`, registerUrl: '', registrationCloses: null, isDoubles: false,
        venues: [{ club: ev.venue, address: ev.city }], contacts: ev.contact ? [{ area: '', club: ev.venue, name: ev.contact.name, phone: ev.contact.phone }] : [], categories, doubles, entries: ev.entries, acceptance,
      });
    } catch (e) { log(`  tennis europe event failed ${id}: ${String(e.message).slice(0, 60)}`); }
  }
  // two events with one name (consecutive weeks in one city): the later ones are numbered so they never merge into one
  docs.sort((a, b) => a.start.localeCompare(b.start));
  const count = new Map();
  for (const d of docs) { const n = (count.get(d.name) ?? 0) + 1; count.set(d.name, n); if (n > 1) d.name = `${d.name} ${n}`; }
  return docs;
}

if (process.argv[1] && process.argv[1].endsWith('te.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const ids = args.flatMap((a, i) => (a === '--id' && args[i + 1] ? [args[i + 1]] : []));
  const docs = await readTennisEurope({ ids });
  for (const d of docs) console.log(`${d.start}..${d.end}  ${d.name}  | ${d.venues[0]?.club}, ${d.venues[0]?.address}  | ${d.entries} entries, ${d.categories.length + d.doubles.length} draws`);
  if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
  const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!base || !process.env.CRON_SECRET) { console.error('--push needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }
  let failed = 0;
  for (const d of docs) {
    const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify(d) });
    console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
    if (!res.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
