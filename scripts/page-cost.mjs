// What does each page cost the database? A handful of single requests, no load: safe for the development quota.
//   node scripts/page-cost.mjs --url https://<dev-site> --bypass <protection-bypass-secret> [--paths /,/rankings,/live]
// The dev site's CRON_SECRET is read from apps/web/.env.development.local (git-ignored) or the CRON_SECRET environment variable.
// For every path: the first request (cold: nothing cached yet on that server) and then the same request again (warm), each with the
// database calls, rows returned, time and page size. The rows are what a hosted database bills as data transfer.
// It refuses to run against the live site.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d = '') => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const base = opt('url').replace(/\/$/, '');
if (!base) { console.error('--url is required'); process.exit(1); }
if (base.includes('ita-league-platform-jpgi.vercel.app') && !/-git-|-[a-z0-9]{9}-arnonerez/.test(base)) { console.error('Refusing to run against the live site. Use the development site.'); process.exit(2); }
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const cron = process.env.CRON_SECRET || loadEnv(path.resolve(here, '../apps/web/.env.development.local')).CRON_SECRET;
const bypass = opt('bypass');
const paths = (opt('paths') || '/,/rankings,/players,/live,/clubs,/api/v1/tournaments,/api/v1/public/rankings?g=MALE&limit=50').split(',');
const headers = { ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) };

const post = async (body) => {
  const r = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', authorization: `Bearer ${cron}` }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
};
const stats = async (action) => post({ kind: 'dev-stats', action });

if (!cron) { console.error('no CRON_SECRET (apps/web/.env.development.local)'); process.exit(1); }
const probe = await stats('reset');
const haveStats = probe.ok;
if (!haveStats) console.log(`(database statistics unavailable: ${probe.status} ${JSON.stringify(probe.json)}; timings and sizes only)\n`);

const one = async (p) => {
  if (haveStats) await stats('reset');
  const t0 = performance.now();
  const r = await fetch(base + p, { headers });
  const buf = await r.arrayBuffer();
  const ms = Math.round(performance.now() - t0);
  const s = haveStats ? (await stats('snapshot')).json : null;
  return { status: r.status, ms, kb: +(buf.byteLength / 1024).toFixed(1), calls: s?.calls, rows: s?.rows, top: s?.top };
};

const pad = (v, n) => String(v ?? '-').padEnd(n);
console.log(pad('path', 46), pad('', 6), pad('status', 7), pad('ms', 6), pad('KB', 8), pad('db calls', 9), 'rows');
for (const p of paths) {
  const cold = await one(p);
  const warm = await one(p);
  const warm2 = await one(p);
  for (const [label, x] of [['cold', cold], ['warm', warm], ['warm', warm2]]) console.log(pad(p, 46), pad(label, 6), pad(x.status, 7), pad(x.ms, 6), pad(x.kb, 8), pad(x.calls, 9), x.rows ?? '-');
  if (cold.top?.length && args.includes('--top')) for (const t of cold.top.slice(0, 4)) console.log(`     ${String(t.rows).padStart(7)} rows / ${t.calls} calls  ${t.q}`);
}
