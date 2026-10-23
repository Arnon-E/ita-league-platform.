// Collects every regulation / procedure / form document the federation publishes (links on ita.co.il) so the app can list them.
// Documents stay on the federation's site; the app only links to them, so they are always the current version.
//
//   node scripts/loglig-sync/regulations.mjs                       # dry run, saves .loglig-dump/regulations.json
//   node scripts/loglig-sync/regulations.mjs --push --url <site>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump'); // LOGLIG_DUMP_DIR: where the development syncs keep their data
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = 'https://ita.co.il';
// pages that carry document links (home, competition listings, and the menus repeated on them)
const PAGES = ['', 'תחרויות-נוער-ארציות', 'תחרויות-נוער-אזוריות', 'תחרויות-סניורים-לאומיות', 'תחרויות-בוגרים-לאומיות', 'תחרויות-נוער-סבב-גילאי-10', 'חזון-האיגוד', 'contact', 'רשימת-מועדונים-חברים-באיגוד', 'בתי-דין-משמעתי'];

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const decodeEnt = (s) => s.replace(/&#038;|&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

// category rules, first match wins (sort keeps the groups in a sensible order)
const RULES = [
  [/חוקת הטניס|חוקי הטניס|תקנון האיגוד|תקנון משמעת|תקנון המשמעת|הטרדות|מוגנות|קוד אתי|הקוד האתי|תקנון ליגה וגביע/, 'תקנוני האיגוד', 1],
  [/ליגות|ליגה|פיינל|אלוף האלופים/, 'ליגות', 3],
  [/סניורים|מאסטרס|IPIN|אייפין/, 'מאסטרס', 4],
  [/בוגרים|אליפות ישראל לבוגרים/, 'בוגרים', 5],
  [/נוער|נהלי תחרויות|TE|טניס אירופה|אירופה|איגרת התנהגות|ווילסון|wilson|קריטריונים|גילאי 10/i, 'נוער ותחרויות', 2],
  [/דירוג/, 'דירוגים', 7],
  [/לוח תחרויות|גאנט|יומן/, 'לוחות תחרויות', 6],
  [/מועדון|ביטוח|לוגליג|מדריך/, 'מועדונים ורישום', 8],
  [/הרצאה|תוכנית|אימון|ועדת מאמנים|סיכום/, 'הדרכה ומקצועי', 9],
];
const DOC = /\.(pdf|docx?|xlsx?)(\?|$)/i;
const KEYWORDS = /הקמת|תקנון|נהלי|נהלים|חוקת|חוקי הטניס|איגרת|אגרת|קריטריונ|הנחיות|הצהרת|קוד אתי|מדריך|הסבר|טופס|תוכנית|דירוג|לוח תחרויות/;
const SKIP = /accessibility|privacy|פרטיות|נגישות|כללים-עדכניים|קורונה|פנייה לאיגוד|forms\.gle/i;

const get = async (u) => { await new Promise((r) => setTimeout(r, 500)); const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } }); return r.ok ? r.text() : ''; };

const found = new Map(); // url -> title
for (const p of PAGES) {
  const html = await get(`${BASE}/${p ? encodeURI(p) + '/' : ''}`);
  for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let u = decodeEnt(m[1]).trim();
    const title = decodeEnt(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (u.startsWith('/')) u = BASE + u;
    u = u.replace(/^http:\/\/(www\.)?ita\.co\.il/, 'https://ita.co.il');
    if (!/^https:\/\/ita\.co\.il\//.test(u) || !title || SKIP.test(u + ' ' + title)) continue;
    // documents (files) with a descriptive title, or pages that are themselves regulations
    const isFile = DOC.test(u);
    if (!isFile && !/תקנון|חוקת הטניס|נהלי תחרויות/.test(title)) continue;
    if (isFile && !KEYWORDS.test(decodeURI(u) + ' ' + title)) continue;
    const prev = found.get(u);
    if (!prev || prev.length < title.length) found.set(u, title);
  }
}

// one entry per document: when two titles point at different files keep both, same title+category from the same file keeps the first
const items = [];
for (const [url, rawTitle] of found) {
  const file = decodeURI(url.split('/').pop() ?? '').replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');
  const generic = /^(נהלי תחרויות|נהלים|תקנון|קראו עוד|להורדה)$/.test(rawTitle);
  const title = generic || rawTitle.length < 4 ? file : rawTitle;
  const hay = `${title} ${file}`;
  const [, category, sort] = RULES.find(([re]) => re.test(hay)) ?? [null, 'אחר', 20];
  items.push({ title, url, category, sort });
}
items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'he'));

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'regulations.json'), JSON.stringify(items, null, 1), 'utf8');
const byCat = items.reduce((m, r) => m.set(r.category, (m.get(r.category) ?? 0) + 1), new Map());
console.log(`${items.length} documents:`, [...byCat].map(([c, n]) => `${c} ${n}`).join(', '));
if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site>.'); process.exit(0); }

const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET.'); process.exit(1); }
const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'regulations', items }) });
console.log('push regulations:', res.status, (await res.text()).slice(0, 160));
process.exit(res.ok ? 0 : 1);
