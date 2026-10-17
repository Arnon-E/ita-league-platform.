// Fills in player profile photos. Loglig's public player endpoint (the one the Android app uses, no login) returns an `Image` file
// name per player, one request each, so this runs in small daily batches: the site says which players still miss a photo
// (those on an account or in an upcoming competition first), this script reads them from Loglig and sends the file names back.
//
//   node scripts/loglig-sync/photos.mjs --url <site> [--limit 300]          # dry run, nothing is sent
//   node scripts/loglig-sync/photos.mjs --push --url <site> [--limit 300]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://loglig.com:8443/api';
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const site = (opt('--url', env.PUBLIC_URL || '') || '').replace(/\/$/, '');
const limit = Number(opt('--limit', '300'));
if (!site) throw new Error('pass --url <site> (or PUBLIC_URL in .env.production.local)');
if (!env.CRON_SECRET) throw new Error('CRON_SECRET missing');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (body) => fetch(`${site}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(body) });

const needed = await (await post({ kind: 'photos-needed', limit })).json();
if (!Array.isArray(needed)) throw new Error(`unexpected answer: ${JSON.stringify(needed).slice(0, 200)}`);
console.log(`${needed.length} players without a photo`);

const items = [];
for (const [i, n] of needed.entries()) {
  await sleep(500);
  try {
    const r = await fetch(`${API}/Player/${n.userId}?unionId=38&leagueId=0&clubId=0`, { headers: { accept: 'application/json' } });
    if (!r.ok) { console.log(`${n.userId}: ${r.status}`); continue; }
    const j = await r.json();
    const image = typeof j?.Image === 'string' && /^PlayerImage_/.test(j.Image) ? j.Image : null;
    items.push({ userId: n.userId, image });
  } catch (e) { console.log(`${n.userId}: ${e.message}`); }
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${needed.length}`);
}
console.log(`${items.filter((x) => x.image).length} with a photo, ${items.filter((x) => !x.image).length} without`);
if (!args.includes('--push')) { console.log('dry run: nothing sent (use --push)'); process.exit(0); }
for (let i = 0; i < items.length; i += 200) {
  const res = await post({ kind: 'photos', items: items.slice(i, i + 200) });
  console.log(res.status, (await res.text()).slice(0, 120));
}
