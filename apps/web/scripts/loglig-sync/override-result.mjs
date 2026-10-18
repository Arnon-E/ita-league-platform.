// Records who won a match the federation's page cannot tell (a match retired at a tied score, "6-6 Ret"). The site applies it on the
// next import of that competition and on every later one, so the sync never undoes it.
//   node scripts/loglig-sync/override-result.mjs --tournament "<competition name>" --a "<player>" --b "<player>" --winner "<player>" [--note "..."] --url <site>
// Then re-import the competition to apply it now: node scripts/loglig-sync/competitions.mjs --list all --all --only "<name part>" --push --url <site>
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('needs --url and CRON_SECRET'); process.exit(1); }
const body = { kind: 'override', tournament: opt('--tournament'), playerA: opt('--a'), playerB: opt('--b'), winner: opt('--winner'), note: opt('--note', '') };
const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(body) });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
