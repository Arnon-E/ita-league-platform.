// Folds combined / alternatively spelled clubs into their canonical club (see src/services/clubs.ts). Run from apps/web:
//   node scripts/merge-clubs.mjs            -> dry run: prints what would change
//   node scripts/merge-clubs.mjs --apply    -> does it
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../.env.production.local')), ...process.env };
const base = (args.includes('--url') ? args[args.indexOf('--url') + 1] : env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('needs --url or PUBLIC_URL, and CRON_SECRET'); process.exit(1); }
const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'merge-clubs', apply: args.includes('--apply') }) });
const j = await res.json().catch(() => null);
if (!res.ok || !j) { console.log(res.status, j); process.exit(1); }
console.log(j.dryRun ? 'DRY RUN (nothing changed)' : 'APPLIED', '- clubs to merge:', j.plan.length, '| players moved:', j.playersMoved);
for (const p of j.plan) console.log(`  ${String(p.playersCount).padStart(3)} players | ${p.from}  ->  ${p.to}`);
