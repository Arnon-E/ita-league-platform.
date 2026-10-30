// Tennis Europe Junior Tour events held in Israel (closed events for Israeli players, organized by the federation).
// Their pages live on te.tournamentsoftware.com, the same software as the Masters tour: details, draws, schedule and results.
//
//   node scripts/loglig-sync/te.mjs                       # dry run: lists the Israeli events with their dates
//   node scripts/loglig-sync/te.mjs --id <tournament id>  # one event, even if the year's list does not show it
//
// Also runs inside `competitions.mjs --list all` (documents are pushed with the other competitions). Read-only: plain GETs and the page's own POSTs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { session } from './tournamentsoftware.mjs';

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

/** "Last changed Friday, 30 October 2026 14:24 (GMT +01:00)" on an event's main page: when its organizer last saved anything. */
export const lastChanged = (html) => text(html).match(/Last changed ([^(]*\(GMT [^)]*\))/)?.[1]?.trim() ?? null;

/** Ids of the Israeli-looking events of the year(s) from the "other events" tab (the page then confirms the country). */
async function candidateIds(ts, years, ids, log) {
  const found = new Map(ids.map((i) => [i.toUpperCase(), '']));
  for (const y of years) {
    try { for (const e of parseOtherEvents(await ts.get(`/tournament/${SEED}/Home/OtherEventsTabContent?year=${y}`, { headers: { 'x-requested-with': 'XMLHttpRequest' } }))) found.set(e.id, e.title); }
    catch (e) { log(`  tennis europe list ${y} failed: ${String(e.message).slice(0, 60)}`); }
  }
  found.set(SEED, found.get(SEED) ?? '');
  return [...found].filter(([id, title]) => ids.map((i) => i.toUpperCase()).includes(id) || id === SEED || /closed event|israel|haifa|tel aviv|jerusalem|raanana|herzliya/i.test(title)).map(([id]) => id);
}

/** One Israeli event as a competition document (details and who is accepted), or null when it is not in Israel. */
export async function readEventDoc(ts, id, year, log = console.log) {
  const html = await ts.get(`/tournament/${id.toLowerCase()}`);
  const ev = parseEvent(html, year);
  if (!ev || !/israel/i.test(ev.country)) return null;
  let acceptance = [];
  try { acceptance = (await readAcceptance(ts, id)).filter((x) => x.players.length); } catch (e) { log(`  no acceptance list for ${ev.title}: ${String(e.message).slice(0, 50)}`); }
  // no draws or matches here: they are read into the event's own page (see abroad.mjs), where the players are not created as new players of the site
  const categories = [], doubles = [];
  return {
    kind: 'competition', name: displayName(ev.title, ev.city), start: ev.start, end: ev.end, feeShekel: 0, level: 'INTERNATIONAL', section: 'YOUTH', sourceUrl: `${TE}/tournament/${id.toLowerCase()}`, registerUrl: '', registrationCloses: null, isDoubles: false,
    venues: [{ club: ev.venue, address: ev.city }], contacts: ev.contact ? [{ area: '', club: ev.venue, name: ev.contact.name, phone: ev.contact.phone }] : [], categories, doubles, entries: ev.entries, acceptance, changed: lastChanged(html),
  };
}

/** Two events with one name (consecutive weeks in one city): the later ones are numbered so they never merge into one. */
const numberDuplicates = (docs) => {
  docs.sort((a, b) => a.start.localeCompare(b.start));
  const count = new Map();
  for (const d of docs) { const n = (count.get(d.name) ?? 0) + 1; count.set(d.name, n); if (n > 1) d.name = `${d.name} ${n}`; }
  return docs;
};

/** Israeli events as competition documents. `ids` adds events by id. */
export async function readTennisEurope({ year = new Date().getFullYear(), ids = [], log = console.log } = {}) {
  const ts = session(TE);
  const docs = [];
  for (const id of await candidateIds(ts, [year, year + 1], ids, log)) {
    try { const d = await readEventDoc(ts, id, year, log); if (d) docs.push({ ...d, id }); }
    catch (e) { log(`  tennis europe event failed ${id}: ${String(e.message).slice(0, 60)}`); }
  }
  return numberDuplicates(docs);
}

if (process.argv[1] && process.argv[1].endsWith('te.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const ids = args.flatMap((a, i) => (a === '--id' && args[i + 1] ? [args[i + 1]] : []));
  if (args.includes('--live')) {
    // started every 10 minutes by the rosters job, 7:00-22:00 Israel time: an Israeli event whose "last changed" moved since the last look is read in full and sent again
    // (its dates, who is accepted, draws and results); about once an hour the list of Israeli events is read again to find new ones
    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }));
    if (!args.includes('--force') && (hour < 7 || hour >= 22)) { console.log('te live: outside 7:00-22:00 (Israel time), nothing to do'); process.exit(0); }
    const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
    if (!base || !process.env.CRON_SECRET) { console.error('--live needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }
    const out = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.loglig-dump');
    mkdirSync(out, { recursive: true });
    const stateFile = path.join(out, 'te-live-state.json');
    let state = { scannedAt: null, events: {} };
    try { if (existsSync(stateFile)) state = { ...state, ...JSON.parse(readFileSync(stateFile, 'utf8')) }; } catch { /* a damaged file: start again */ }
    const ts = session(TE);
    const year = new Date().getFullYear();
    const full = args.includes('--force') || !state.scannedAt || Date.now() - Date.parse(state.scannedAt) > 50 * 60e3;
    if (full) {
      state.scannedAt = new Date().toISOString();
      for (const id of await candidateIds(ts, [year, year + 1], [], console.log)) state.events[id] ??= { changed: null, end: null };
    }
    const today = new Date().toISOString().slice(0, 10);
    const docs = [], meta = [];
    for (const [id, known] of Object.entries(state.events)) {
      try {
        if (known.end && known.end < today) continue; // over
        const html = await ts.get(`/tournament/${id.toLowerCase()}`);
        const changed = lastChanged(html);
        const ev = parseEvent(html, year);
        if (!ev || !/israel/i.test(ev.country)) { delete state.events[id]; continue; }
        known.end = ev.end;
        meta.push({ id, name: displayName(ev.title, ev.city), start: ev.start });
        if (changed && changed === known.changed) continue; // nothing was saved since the last look
        const d = await readEventDoc(ts, id, year);
        if (d) { docs.push({ ...d, id }); known.changed = changed; }
      } catch (e) { console.log(`  ${id}: ${String(e.message).slice(0, 60)}`); }
    }
    console.log(`te live: ${Object.keys(state.events).length} event(s) known, ${docs.length} changed`);
    // the names of events that share one are numbered over all the events known, not only the ones sent now, so a name never flips between runs
    const names = new Map(numberDuplicates(meta).map((m) => [m.id, m.name]));
    for (const d of docs) d.name = names.get(d.id) ?? d.name;
    let failed = 0;
    for (const d of docs) {
      const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify(d) });
      console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
      if (!res.ok) { failed++; state.events[d.id].changed = null; } // sent again at the next look
    }
    writeFileSync(stateFile, JSON.stringify(state));
    process.exit(failed ? 1 : 0);
  }
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
