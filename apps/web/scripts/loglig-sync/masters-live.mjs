// Fresh schedule and results of the Masters competition that is on today, from tournamentsoftware.com. Meant to be started by the
// 10-minute live sync, but it only does anything once an hour (a stamp file in the dump folder) and reads only TODAY's match day:
// the other days come from the daily sync's cache (ts-cache/<tournament>.json), which this run updates.
//
//   node scripts/loglig-sync/masters-live.mjs --url <site>            # dry run: reads tournamentsoftware.com, sends nothing
//   node scripts/loglig-sync/masters-live.mjs --push --url <site>
//   --force   ignore the once-an-hour stamp
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORG_URL, buildTsCompetition, parseOrgList, readDay, readDraws, readTournament, replaceDay, sameMasters, session } from './tournamentsoftware.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const push = args.includes('--push');
const EVERY_MIN = 50; // started every 10 minutes, runs about once an hour

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const site = (opt('--url', env.PUBLIC_URL || '') || '').replace(/\/$/, '');
if (!site) throw new Error('pass --url <site> (or PUBLIC_URL in .env.production.local)');
if (push && !env.CRON_SECRET) throw new Error('CRON_SECRET missing');

mkdirSync(OUT, { recursive: true });
const stamp = path.join(OUT, 'masters-live.stamp');
if (!args.includes('--force') && existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < EVERY_MIN * 60000) {
  console.log(`last run less than ${EVERY_MIN} minutes ago, skipping`);
  process.exit(0);
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // YYYY-MM-DD

const ts = session();
const org = parseOrgList(await ts.get(ORG_URL)).filter((t) => t.start <= today && today <= t.end);
console.log(`${org.length} Masters tournament(s) on ${today}`);
writeFileSync(stamp, new Date().toISOString(), 'utf8'); // even when nothing is on, so the organization page is read once an hour at most
if (!org.length) process.exit(0);

const res0 = await fetch(`${site}/api/v1/tournaments`, { headers: { accept: 'application/json' } });
const onSite = res0.ok ? (await res0.json()).filter((t) => !['FINISHED', 'CANCELLED'].includes(t.status)) : [];

let sent = 0;
for (const t of org) {
  const siteT = onSite.find((x) => sameMasters(t.name, x.name));
  if (!siteT) { console.log(`- ${t.name}: not on the site (or already finished there)`); continue; }
  try {
    const file = path.join(OUT, 'ts-cache', `${t.id}.json`);
    let cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (!cache || Date.now() - cache.at > 3 * 86400000) { // no daily-sync cache (or an old one): read every day once
      const all = await readTournament(ts, t.id);
      cache = { at: Date.now(), raw: all.raw, draws: all.draws };
    } else {
      cache = { at: cache.at, raw: replaceDay(cache.raw, today, await readDay(ts, t.id, today)), draws: await readDraws(ts, t.id) };
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(cache), 'utf8');
    const { categories, doubles } = buildTsCompetition(cache.raw, cache.draws);
    console.log(`- ${siteT.name} <- ${t.name}: ${categories.length} categories, ${doubles.length} doubles, ${cache.raw.filter((r) => r.day === today).length} matches today`);
    if (!categories.length && !doubles.length) continue;
    const doc = { kind: 'competition', resultsOnly: true, name: siteT.name, start: String(siteT.startDate).slice(0, 10), end: String(siteT.endDate).slice(0, 10), feeShekel: 0, level: 'NATIONAL', section: 'MASTERS', venues: [], categories, doubles };
    if (!push) continue;
    const res = await fetch(`${site}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(doc) });
    console.log(res.status, (await res.text()).slice(0, 200));
    sent++;
  } catch (e) { console.warn('  failed', t.name, String(e.message).slice(0, 80)); }
}
console.log(push ? `sent ${sent} competition(s)` : 'dry run: nothing sent (use --push)');
