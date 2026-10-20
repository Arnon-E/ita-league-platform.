// Creates / removes the clearly-marked test accounts (see docs/test-users.md). Run from apps/web:
//   node scripts/test-user.mjs create            -> a [TEST] player account
//   node scripts/test-user.mjs create --admin    -> a [TEST] federation-admin account
//   node scripts/test-user.mjs delete            -> removes every test account and what it owns
// The password is generated on the server and printed once, here, in your terminal.
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
const env = { ...loadEnv(path.resolve(here, '../.env.production.local')), ...process.env };
const base = opt('--url', env.PUBLIC_URL ?? 'https://ita-league-platform-jpgi.vercel.app').replace(/\/$/, '');
const action = args.find((a) => a === 'create' || a === 'delete');
if (!action || !env.CRON_SECRET) { console.error('usage: node scripts/test-user.mjs create|delete [--admin] [--url <site>]  (needs CRON_SECRET)'); process.exit(1); }
const body = action === 'create' ? { kind: 'test-user-create', role: args.includes('--admin') ? 'FEDERATION_ADMIN' : 'PLAYER' } : { kind: 'test-user-delete' };
const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(body) });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
