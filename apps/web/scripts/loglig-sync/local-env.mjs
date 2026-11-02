// Fills CRON_SECRET / PUBLIC_URL from .env.production.local when the environment does not already have them (rosters.mjs and masters-live.mjs do the same),
// so the 10-minute and daily jobs push without the secret having to be set in Windows. Values already in the environment win (the development syncs set their own).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.production.local');
if (existsSync(file)) {
  for (const l of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*(CRON_SECRET|PUBLIC_URL)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
