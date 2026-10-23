// Graduated load test with no dependencies:
//   node scripts/loadtest.mjs --url https://<dev-site> --bypass <protection-bypass-secret> [--steps 10,25,50,100,200,400] [--secs 20] [--think 1000]
//        [--max-requests 12000] [--max-err 5] [--max-p95 15000] [--stats] [--paths /,/rankings,...]
// Each step keeps N "users" in flight: a user opens a random page from the mix, waits a think time, and repeats.
// It climbs step by step and STOPS on its own when a step has too many failures or is too slow, or when the total request budget is spent,
// so it cannot hammer a host that is down or use up a free plan (the host's quotas are shared with the live site: see docs/dev-environment.md).
// --stats also asks the development database (via /api/sync/loglig, CRON_SECRET from apps/web/.env.development.local) how many queries and rows
// each step cost, which is how you see what the caches save.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const base = (arg('url', '') || '').replace(/\/$/, '');
if (!base) { console.error('--url is required'); process.exit(1); }
// Never aim this at the live site by accident: it spends the production database's data-transfer quota (that is how the site went down once).
const LIVE_HOSTS = ['ita-league-platform-jpgi.vercel.app'];
if (LIVE_HOSTS.some((h) => base.includes(h)) && !flag('allow-production')) {
  console.error('Refusing to load-test the LIVE site. Use the development environment (docs/dev-environment.md), or pass --allow-production if you really mean it.');
  process.exit(2);
}
const steps = arg('steps', '10,25,50,100,200,400').split(',').map(Number);
const secs = Number(arg('secs', '20'));
// a visitor's typical pages, weighted by repetition: mostly the home page, then rankings, matches, players
const paths = arg('paths', '/,/,/,/,/rankings,/rankings,/rankings?g=FEMALE&age=12,/players,/live,/clubs,/api/v1/tournaments').split(',');
const think = Number(arg('think', '1000'));
const header = arg('header', '');
const bypass = arg('bypass', '');
const maxRequests = Number(arg('max-requests', '12000'));
const maxErr = Number(arg('max-err', '5'));
const maxP95 = Number(arg('max-p95', '15000'));
const wantStats = flag('stats');

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const cron = process.env.CRON_SECRET || loadEnv(path.resolve(here, '../apps/web/.env.development.local')).CRON_SECRET;
const baseHeaders = { ...(header ? { cookie: header } : {}), ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) };
const stats = async (action) => {
  const r = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { ...baseHeaders, 'content-type': 'application/json', authorization: `Bearer ${cron}` }, body: JSON.stringify({ kind: 'dev-stats', action }) });
  return r.ok ? r.json() : null;
};

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
let sent = 0;

async function step(users) {
  const lat = []; const codes = {}; const byPath = {}; let errors = 0, bytes = 0, n = 0;
  const end = Date.now() + secs * 1000;
  if (wantStats) await stats('reset');
  const user = async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 1500)); // stagger the start
    while (Date.now() < end && sent < maxRequests) {
      sent++; n++;
      const p = paths[Math.floor(Math.random() * paths.length)];
      const t0 = performance.now();
      try {
        const res = await fetch(base + p, { signal: AbortSignal.timeout(30000), headers: baseHeaders });
        const buf = await res.arrayBuffer();
        const ms = performance.now() - t0;
        bytes += buf.byteLength; lat.push(ms);
        codes[res.status] = (codes[res.status] ?? 0) + 1;
        (byPath[p] ??= []).push(ms);
        if (res.status >= 500 || res.status === 429) errors++;
      } catch { errors++; codes.ERR = (codes.ERR ?? 0) + 1; }
      await new Promise((r) => setTimeout(r, think * (0.5 + Math.random())));
    }
  };
  await Promise.all(Array.from({ length: users }, user));
  lat.sort((a, b) => a - b);
  const total = lat.length + (codes.ERR ?? 0);
  const row = { users, req: total, rps: +(total / secs).toFixed(1), p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)), max: Math.round(lat.at(-1) ?? 0), errPct: +((errors / Math.max(1, total)) * 100).toFixed(1), MB: +(bytes / 1048576).toFixed(1), codes };
  console.log(JSON.stringify(row));
  const slow = Object.entries(byPath).map(([p, a]) => [p, pct(a.sort((x, y) => x - y), 95), a.length]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log('   slowest p95:', slow.map(([p, ms, c]) => `${p} ${Math.round(ms)}ms (${c})`).join(' | '));
  if (wantStats) {
    const s = await stats('snapshot');
    if (s) {
      console.log(`   database: ${s.calls} queries, ${s.rows} rows  =  ${(s.calls / Math.max(1, total)).toFixed(2)} queries and ${(s.rows / Math.max(1, total)).toFixed(1)} rows per request`);
      for (const t of (s.top ?? []).slice(0, 3)) console.log(`      ${String(t.rows).padStart(7)} rows / ${t.calls} calls  ${t.q.slice(0, 90)}`);
    } else console.log('   database: statistics unavailable');
  }
  return row;
}

console.log(`target ${base}\n${steps.length} steps x ${secs}s, think ${think}ms, budget ${maxRequests} requests, stops at ${maxErr}% errors or p95 ${maxP95}ms`);
for (const n of steps) {
  const r = await step(n);
  if (r.errPct > maxErr) { console.log(`stopping: ${r.errPct}% errors`); break; }
  if (r.p95 > maxP95) { console.log(`stopping: p95 ${r.p95}ms is over ${maxP95}ms`); break; }
  if (sent >= maxRequests) { console.log(`stopping: request budget (${maxRequests}) spent`); break; }
  await new Promise((res) => setTimeout(res, 8000)); // let the host and the database settle between steps
}
console.log(`done: ${sent} requests sent`);
