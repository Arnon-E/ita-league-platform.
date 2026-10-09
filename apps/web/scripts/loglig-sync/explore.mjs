// Loglig explorer (runs locally on your PC, costs nothing, nothing leaves your machine).
//
// What it does: opens Microsoft Edge (visible), logs in to loglig.com with the account in .env.local, then saves the HTML and a
// screenshot of the pages you list (and, with --crawl, the pages they link to) into ./.loglig-dump/. Read-only: it only navigates
// (GET), never clicks buttons, never submits forms, and skips logout/delete style links.
//
//   pnpm loglig:explore                         # default seed pages
//   pnpm loglig:explore -- --crawl 40           # also follow links, up to 40 pages
//   pnpm loglig:explore -- --url "https://loglig.com/Players/Edit/269305?seasonId=1755"   # extra pages (repeatable)
//
// The dump contains personal data (players, minors). It is git-ignored; keep it on this PC.
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
const PROFILE = path.resolve(here, '../../.loglig-profile'); // keeps the login session between runs (git-ignored)
const BASE = 'https://loglig.com';

// --- config -----------------------------------------------------------------------------------------------------------------------
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.join(here, '.env.local')), ...process.env };
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const urls = args.flatMap((a, i) => (a === '--url' ? [args[i + 1]] : []));
const crawl = Number(flag('--crawl') ?? 0);
const seeds = [
  `${BASE}/`,
  ...urls,
  ...(env.LOGLIG_EXTRA_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
];
const SKIP = /(logout|signout|log-off|delete|remove|cancel|unsubscribe|destroy|\/Account\/Logoff)/i;

// --- helpers ----------------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (u) => {
  const x = new URL(u);
  const base = (x.pathname + x.search).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70) || 'home';
  return `${base}_${createHash('sha1').update(u).digest('hex').slice(0, 6)}`;
};

// --- run --------------------------------------------------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'msedge', headless: false, viewport: { width: 1400, height: 900 }, locale: 'he-IL',
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log('Opening Loglig login...');
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded' });
await sleep(1500);

const loggedIn = () => !/\/Login/i.test(page.url()) || false;
if (!loggedIn() || (await page.locator('input[type=password]').count()) > 0) {
  const user = env.LOGLIG_USER, pass = env.LOGLIG_PASSWORD;
  if (user && pass) {
    console.log('Logging in with the account from .env.local ...');
    const pw = page.locator('input[type=password]').first();
    const un = page.locator('input:not([type=password]):not([type=hidden]):not([type=checkbox]):not([type=submit])').first();
    await un.fill(user);
    await pw.fill(pass);
    await pw.press('Enter');
  } else {
    console.log('No LOGLIG_USER / LOGLIG_PASSWORD in .env.local: please log in yourself in the Edge window (captcha / 2FA are fine).');
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60_000) {
    await sleep(1500);
    if (!/\/Login/i.test(page.url()) && (await page.locator('input[type=password]').count()) === 0) break;
  }
  if (/\/Login/i.test(page.url())) { console.error('Still on the login page after 5 minutes. Check the credentials in .env.local, then run again.'); await ctx.close(); process.exit(1); }
}
console.log('Logged in:', page.url());

const queue = [...seeds.map((u) => (u.startsWith('http') ? u : BASE + u))];
const seen = new Set();
const index = [];
const maxPages = Math.max(crawl, seeds.length);
let n = 0;

while (queue.length && n < maxPages) {
  const url = queue.shift();
  if (seen.has(url) || SKIP.test(url)) continue;
  seen.add(url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const file = slug(url);
    writeFileSync(path.join(OUT, `${file}.html`), await page.content(), 'utf8');
    await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true }).catch(() => {});
    const title = await page.title();
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
    const same = [...new Set(links.filter((l) => l.startsWith(BASE) && !l.includes('#') && !SKIP.test(l)))];
    index.push({ url, final: page.url(), title, file, links: same.length });
    n++;
    console.log(`[${n}/${maxPages}] ${title || '(no title)'}  ${url}  (${same.length} links)`);
    if (crawl > 0) for (const l of same) if (!seen.has(l)) queue.push(l);
  } catch (e) {
    console.warn('  skipped', url, String(e.message ?? e).slice(0, 80));
  }
  await sleep(1200); // be polite to their server
}

writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`\nSaved ${index.length} page(s) to ${OUT}`);
console.log('Next: tell Claude it is done; the pages (index.json + .html files) show the structure to build the extractors from.');
await ctx.close();
