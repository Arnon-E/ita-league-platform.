// ITF World Tennis Tour Juniors (J30 .. J500): the public calendar the itftennis.com site itself loads (JSON, no login).
// Tournaments outside Israel go to the site's "abroad" page; ones held in Israel become competitions like the Tennis Europe events in Israel.
//
//   node scripts/loglig-sync/itf.mjs                       # dry run (next 240 days)
//   node scripts/loglig-sync/itf.mjs --push --url <site>   # CRON_SECRET from the environment
//
// Read-only: plain GETs, 100 tournaments a page. The list has no entry deadlines or fees, so the page shows the link to the tournament's own page.
import { hebrewCity } from './te.mjs';

const ITF = 'https://www.itftennis.com';
const UA = { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)', accept: 'application/json' };

/** One calendar item -> { id, name, venue, city, country, countryCode, start, end, surface, category, indoor, closed, url }. */
export function parseItem(it) {
  if (!it?.tournamentKey || !it.startDate || !it.endDate) return null;
  return {
    id: String(it.tournamentKey).toUpperCase(), name: String(it.name ?? it.tournamentName ?? '').replace(/\s*\(closed\)\s*/i, ' ').replace(/\s+/g, ' ').trim(),
    venue: String(it.promotionalName ?? '').trim() || String(it.venue ?? '').trim(), city: String(it.location ?? it.venue ?? '').trim(), country: String(it.hostNation ?? '').trim(), countryCode: String(it.hostNationCode ?? ''),
    start: String(it.startDate).slice(0, 10), end: String(it.endDate).slice(0, 10), surface: String(it.surfaceDesc ?? '').trim(), category: String(it.category ?? '').trim(),
    indoor: /indoor/i.test(String(it.indoorOrOutDoor ?? '')) ? true : /outdoor/i.test(String(it.indoorOrOutDoor ?? '')) ? false : null,
    closed: /\(closed\)/i.test(String(it.name ?? it.tournamentName ?? '')), url: it.tournamentLink ? `${ITF}${it.tournamentLink}` : `${ITF}/en/tournament-calendar/world-tennis-tour-juniors-calendar/`,
  };
}

export async function readItf({ days = 240, log = console.log } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const items = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    await new Promise((r) => setTimeout(r, 700));
    const res = await fetch(`${ITF}/tennis/api/TournamentApi/GetCalendar?circuitCode=JT&searchString=&skip=${skip}&take=100&nationCodes=&zoneCodes=&dateFrom=${today}&dateTo=${to}&indoorOutdoor=&categories=&isOrderAscending=true&orderField=startDate&surfaceCodes=`, { headers: UA });
    if (!res.ok) throw new Error(`itf ${res.status}`);
    const body = await res.json();
    items.push(...(body.items ?? []));
    if (items.length >= (body.totalItems ?? 0) || !(body.items ?? []).length) break;
  }
  const all = [...new Map(items.map(parseItem).filter(Boolean).map((e) => [e.id, e])).values()];
  log(`  itf juniors ${today}..${to}: ${all.length} tournaments`);
  return { events: all.filter((e) => e.countryCode !== 'ISR'), israel: all.filter((e) => e.countryCode === 'ISR'), until: to };
}

/** ITF juniors held in Israel as competition documents ("ITF J30 רמת השרון"). */
export function israelDocs(israel) {
  return israel.map((e) => ({
    kind: 'competition', name: `ITF ${e.category} ${hebrewCity(e.city, e.name) ?? e.city}`.replace(/\s+/g, ' ').trim(), start: e.start, end: e.end, feeShekel: 0, level: 'INTERNATIONAL', section: 'YOUTH',
    sourceUrl: e.url, registerUrl: '', registrationCloses: null, isDoubles: false, venues: [{ club: e.venue, address: e.city }], contacts: [], categories: [], doubles: [],
  }));
}

if (process.argv[1] && process.argv[1].endsWith('itf.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const { events, israel, until } = await readItf({ days: Number(opt('--days', 240)) });
  for (const e of events) console.log(`${e.start}..${e.end}  ${e.country.padEnd(16)} ${e.city.padEnd(18)} ${e.category.padEnd(5)} ${e.surface.padEnd(8)} ${e.name}`);
  const docs = israelDocs(israel);
  for (const d of docs) console.log(`ISRAEL ${d.start}..${d.end}  ${d.name}`);
  console.log(`${events.length} ITF tournament(s) abroad, ${docs.length} in Israel`);
  if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
  const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!base || !process.env.CRON_SECRET) { console.error('--push needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }
  const post = async (body, label) => {
    const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify(body) });
    console.log(`push ${label}: ${res.status} ${(await res.text()).slice(0, 160)}`);
    return res.ok;
  };
  let ok = await post({ kind: 'abroad', circuit: 'ITF', events, until }, 'itf abroad');
  for (const d of docs) ok = (await post(d, d.name)) && ok;
  process.exit(ok ? 0 : 1);
}
