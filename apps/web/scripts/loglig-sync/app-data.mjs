// Everything the Loglig Android app shows that is not a competition, ranking or league:
// the federation's about text / regulation text, events, registration forms, sponsors, age groups, and the clubs the app lists
// (contact details, officials, teams, registered players). All from the same public endpoints the app calls, no login.
//
//   node scripts/loglig-sync/app-data.mjs                          # dry run, saves .loglig-dump/app-data.json
//   node scripts/loglig-sync/app-data.mjs --push --url <site>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
const API = 'https://loglig.com:8443/api';
const UNION = 38;
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(p, fallback) {
  await sleep(400);
  try {
    const r = await fetch(`${API}/${p}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

const union = await get(`NewUnion/GetUnionDetails/${UNION}`, {});
const events = await get(`NewUnion/GetUnionEvents/${UNION}`, []);
const forms = await get(`NewUnion/GetUnionRegistrationForms/${UNION}`, []);
const sponsors = await get(`NewUnion/GetUnionSponsors/${UNION}`, []);
const ages = await get(`Union/CompetitionAges/${UNION}`, []);

const infoDocs = {
  union: { description: union.Description ?? '', about: union.IndexAbout ?? '', regulation: union.Regulation ?? '', statement: union.PlayerStatement ?? '', image: union.PrimaryImage ?? '' },
  events: events.map((e) => ({ title: e.Title, place: e.Place ?? '', image: e.EventImage ?? '', start: e.EventStartDate ?? '', end: e.EventEndDate ?? '', description: e.EventDescription ?? '', url: e.RegistrationLink ?? '' })),
  forms: forms.map((f) => ({ id: f.ActivityId, name: f.Name, description: f.Description ?? '', url: f.URL ?? '' })),
  sponsors: sponsors.map((x) => ({ id: x.Id, url: x.LinkUrl ?? '', image: x.Image ?? '' })),
  ages: ages.map((a) => ({ id: a.id, name: a.age_name })),
};

const clubs = [];
for (const area of [1, 2, 3, 4, 5]) {
  for (const c of await get(`Union/ClubsArea${area}/${UNION}`, [])) {
    const info = await get(`Clubs/${c.id}`, {});
    const roster = await get(`Clubs/players/${c.id}`, {});
    clubs.push({
      logligId: c.id, name: info.info?.clubname || c.name, area, logo: info.info?.logo ?? c.logo ?? '', address: info.info?.address ?? '', phone: info.info?.phone ?? '',
      email: info.info?.email ?? '', description: info.info?.description ?? '', players: c.totalPlayers ?? info.main?.players ?? 0,
      officials: (info.officials ?? []).map((o) => ({ name: o.fullname, job: o.jobname })),
      teams: (info.teams ?? []).map((t) => (typeof t === 'string' ? t : t.name ?? t.TeamName ?? t.teamName ?? t.Title ?? '')).filter(Boolean),
      roster: (roster.players ?? []).map((p) => ({ name: p.FullName, age: p.Age ?? null })),
    });
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'app-data.json'), JSON.stringify({ ...infoDocs, clubs }), 'utf8');
console.log(`union text ${infoDocs.union.about.length + infoDocs.union.regulation.length} chars, ${infoDocs.events.length} events, ${infoDocs.forms.length} forms, ${infoDocs.sponsors.length} sponsors, ${infoDocs.ages.length} age groups, ${clubs.length} clubs (${clubs.reduce((n, c) => n + c.roster.length, 0)} registered players)`);
if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site>.'); process.exit(0); }

const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET.'); process.exit(1); }
const post = async (body) => {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(body) });
  console.log(`push ${body.kind}${body.key ? ':' + body.key : ''}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.ok;
};
let ok = true;
for (const [key, data] of Object.entries(infoDocs)) ok = (await post({ kind: 'site-info', key, data })) && ok;
ok = (await post({ kind: 'clubs', items: clubs })) && ok;
process.exit(ok ? 0 : 1);
