// Ramp load test with no dependencies:  node scripts/loadtest.mjs --url https://host [--steps 10,50,100,250,500,1000] [--secs 15] [--paths /,/api/v1/tournaments]
// Each step keeps N "users" in flight: every user fetches a random path, waits a short think time, and repeats.
// It stops climbing when more than 20% of a step's requests fail, so it cannot hammer a host that is already down.
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = (arg('url', '') || '').replace(/\/$/, '');
if (!base) { console.error('--url is required'); process.exit(1); }
const steps = arg('steps', '10,50,100,250,500,1000').split(',').map(Number);
const secs = Number(arg('secs', '15'));
const paths = arg('paths', '/,/api/v1/tournaments,/rankings,/api/v1/public/live,/live').split(',');
const think = Number(arg('think', '300'));
const header = arg('header', '');

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);

async function step(users) {
  const lat = []; const codes = {}; let errors = 0;
  const end = Date.now() + secs * 1000;
  const user = async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 1000)); // stagger the start
    while (Date.now() < end) {
      const p = paths[Math.floor(Math.random() * paths.length)];
      const t0 = performance.now();
      try {
        const res = await fetch(base + p, { signal: AbortSignal.timeout(30000), headers: header ? { cookie: header } : {} });
        await res.arrayBuffer();
        lat.push(performance.now() - t0);
        codes[res.status] = (codes[res.status] ?? 0) + 1;
        if (res.status >= 500 || res.status === 429) errors++;
      } catch { errors++; codes.ERR = (codes.ERR ?? 0) + 1; }
      await new Promise((r) => setTimeout(r, think * (0.5 + Math.random())));
    }
  };
  await Promise.all(Array.from({ length: users }, user));
  lat.sort((a, b) => a - b);
  const total = lat.length + (codes.ERR ?? 0);
  const row = { users, req: total, rps: +(total / secs).toFixed(1), p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)), max: Math.round(lat.at(-1) ?? 0), errPct: +((errors / Math.max(1, total)) * 100).toFixed(1), codes };
  console.log(JSON.stringify(row));
  return row;
}

console.log(`target ${base}  paths ${paths.join(' ')}  ${secs}s per step`);
for (const n of steps) {
  const r = await step(n);
  if (r.errPct > 20) { console.log('stopping: more than 20% errors'); break; }
  await new Promise((res) => setTimeout(res, 5000)); // let the host recover between steps
}
