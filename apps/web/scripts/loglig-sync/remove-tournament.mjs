// Removes a mirrored/test tournament from a site by its exact name (refuses if it has payments).
//   node scripts/loglig-sync/remove-tournament.mjs "בדיקה" --url https://ita-league-platform-jpgi.vercel.app
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// --test-competition = the sample competition created while testing (its name is Hebrew, which a .bat file may garble)
const name = args.includes('--test-competition') ? 'בדיקה' : args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!name || !base || !env.CRON_SECRET) { console.error('usage: remove-tournament.mjs "<exact name>" --url <site>   (CRON_SECRET from env or .env.production.local)'); process.exit(1); }
const res = await fetch(`${base}/api/sync/loglig`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'remove-tournament', name }),
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
