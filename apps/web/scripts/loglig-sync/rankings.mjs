// Mirrors the PUBLIC Loglig ranking tables (no login needed) into this app.
//
//   node scripts/loglig-sync/rankings.mjs                 # fetch + save to .loglig-dump/rankings-*.json (dry run, nothing is sent)
//   node scripts/loglig-sync/rankings.mjs --push          # also send to PUBLIC_URL/api/sync/loglig (needs CRON_SECRET)
//   node scripts/loglig-sync/rankings.mjs --push --url http://localhost:3100
//
// CRON_SECRET and PUBLIC_URL come from the environment, or from apps/web/.env.production.local (git-ignored).
// Read-only against Loglig: two POSTs to the same public endpoint that their own ranking page uses.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
const SRC = 'https://loglig.com:2053/LeagueRank/TennisUnionRanks';
const UNION = 38, SEASON = 1755;

const args = process.argv.slice(2);
const push = args.includes('--push');
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : undefined;

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };

const decode = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;

function parse(html) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(decode);
    if (cells.length < 11 || !/^\d+$/.test(cells[0])) continue; // skips the header
    rows.push({ rank: num(cells[0]), name: cells[1], birthYear: num(cells[2]), club: cells[3], national: num(cells[4]), international: num(cells[9]), total: num(cells[10]) });
  }
  return rows;
}

async function fetchGender(genderId) {
  const body = new URLSearchParams({ unionId: String(UNION), seasonId: String(SEASON), ageId: '', genderId: String(genderId), isModal: 'true' });
  const r = await fetch(SRC, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' } });
  if (!r.ok) throw new Error(`Loglig answered ${r.status}`);
  return parse(await r.text());
}

mkdirSync(OUT, { recursive: true });
const sets = [['MALE', 1], ['FEMALE', 0]];
const results = [];
for (const [gender, id] of sets) {
  const rows = await fetchGender(id);
  console.log(`${gender}: ${rows.length} ranked players`, rows[0] ? `(top: ${rows[0].name}, ${rows[0].total})` : '');
  if (!rows.length) { console.error('No rows parsed: Loglig may have changed its page. Nothing was sent.'); process.exit(2); }
  writeFileSync(path.join(OUT, `rankings-${gender}.json`), JSON.stringify(rows), 'utf8');
  results.push({ gender, rows });
}

if (!push) { console.log('\nDry run: saved to', OUT, '(add --push to send to the site)'); process.exit(0); }

const base = (urlArg ?? env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs PUBLIC_URL and CRON_SECRET (in apps/web/.env.production.local or the environment).'); process.exit(1); }
for (const r of results) {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(r) });
  console.log(`push ${r.gender}:`, res.status, await res.text());
  if (!res.ok) process.exit(1);
}
console.log('Done. Refresh the Rankings page.');
