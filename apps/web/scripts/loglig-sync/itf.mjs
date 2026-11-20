// ITF World Tennis Tour Juniors events (world.tennis) for the site's event page: the draws (main and qualifying, singles and doubles) and the order of play
// with the results, in the shape the page already shows for Tennis Europe events (`abroad_events.results`).
// world.tennis sits behind a bot wall (Incapsula + hCaptcha) that a plain request cannot pass. A real Edge keeps what it earned after a person solved the
// CAPTCHA once (`--solve` opens a window for that), and later runs reuse that profile in the background. When the wall asks again the run stops and says so.
// Pure parsers (no network, unit tested) first, then the reader and the command line.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './local-env.mjs';

const SITE = 'https://www.world.tennis';
const API = '/tennis/api/TournamentApi/';
export const eventPage = (slug, key) => `${SITE}/en/tournament/${slug}/${key.split('-')[2]?.toLowerCase()}/${key.split('-')[3]}/${key.toLowerCase()}/`;

/** "amit keinan" / "URI STRETINER" -> "Amit Keinan" / "Uri Stretiner": the entries are typed by hand, in any case. */
export const titleName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());

const person = (p) => titleName(`${p.givenName ?? ''} ${p.familyName ?? ''}`);

/** One side of a match: its players' names and nations, whether it won. A slot not drawn yet (or a bye) has no names. */
function side(team, msg = '') {
  const players = (team?.players ?? []).filter((p) => p && !p.hiddenPlayer && (p.givenName || p.familyName));
  return { names: players.map(person), cc: players.map((p) => String(p.nationality ?? '').toUpperCase().slice(0, 3)), won: !!team?.isWinner, msg };
}

/** Set scores of a match, "[6,4]" per set; a set not played (null) ends the list. */
export function setsOf(teams) {
  const [a, b] = [teams?.[0]?.scores ?? [], teams?.[1]?.scores ?? []];
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] == null || b[i] == null || a[i].score == null || b[i].score == null) break;
    out.push([a[i].score, b[i].score]);
  }
  return out;
}

/** "Walkover" / "Retired" ... when the match did not end on court; empty otherwise. */
const resultMsg = (m) => (m.resultStatusCode || m.resultStatusDesc ? String(m.resultStatusDesc ?? m.resultStatusCode).slice(0, 40) : '');

const KIND = { S: 'Singles', D: 'Doubles' };
/** "BS Main Draw", "GD Main Draw", "BS Qualifying": the names the page sorts into boys, girls and doubles by their first letters. */
export const drawName = (playerType, matchType, classification) => `${playerType}${matchType} ${classification === 'Q' ? 'Qualifying' : 'Main Draw'} · ${playerType === 'B' ? 'Boys' : 'Girls'}' ${KIND[matchType]}`;

/** The (player type, match type, classification) draws an event has, from its filters: [{ pt, mt, ec, ds }]. */
export function drawsOf(filters) {
  const out = [];
  for (const pt of filters?.filters ?? []) for (const mt of pt.subFilter ?? []) for (const ec of mt.subFilter ?? []) for (const ds of ec.subFilter ?? []) out.push({ pt: pt.valueCode, mt: mt.valueCode, ec: ec.valueCode, ds: ds.valueCode });
  return out;
}

/**
 * A knockout draw as a list of rounds. Qualifying draws come as several small trees: their matches are put side by side, round by round, as the page expects.
 * `n` orders the draws of one category: main singles, main doubles, then qualifying.
 */
export function drawFromSheet(sheet, d, n) {
  const groups = sheet?.koGroups ?? [];
  const rounds = [];
  for (const g of groups) (g.rounds ?? []).forEach((r, i) => { (rounds[i] ??= []).push(...(r.matches ?? []).map((m) => {
    const msg = resultMsg(m);
    const a = side(m.teams?.[0], msg), b = side(m.teams?.[1], msg);
    return { a: { names: a.names, cc: a.cc, won: a.won }, b: { names: b.names, cc: b.cc, won: b.won }, sets: setsOf(m.teams), date: '' };
  })); });
  return { n, name: drawName(d.pt, d.mt, d.ec), kind: 'KO', rounds: rounds.filter((r) => r.length) };
}
export const drawOrder = (d) => (d.ec === 'Q' ? 3 : d.mt === 'D' ? 2 : 1) + (d.pt === 'G' ? 10 : 0);

/** "Starting at 11:00" -> "11:00"; "Followed by" -> "" (no fixed time). */
const timeOf = (s) => /\b(\d{1,2}:\d{2})\b/.exec(String(s ?? ''))?.[1] ?? '';
const DRAW_OF = (desc) => ({ pt: /^girls/i.test(desc) ? 'G' : 'B', mt: /doubles/i.test(desc) ? 'D' : 'S' });

/** The matches of one day of play, by court: [{ day, draw, stage, court, time, a, b, sets }]. `day` is "YYYY-MM-DD". */
export function matchesFromOrderOfPlay(day, courts) {
  const out = [];
  for (const c of courts ?? []) for (const m of c.matches ?? []) {
    const { pt, mt } = DRAW_OF(m.eventDesc ?? '');
    const msg = resultMsg(m);
    const a = side(m.teams?.[0], msg), b = side(m.teams?.[1], msg);
    if (!a.names.length && !b.names.length) continue;
    out.push({ day, draw: drawName(pt, mt, m.eventClassificationCode), stage: String(m.roundGroupDesc ?? '').slice(0, 40), court: String(c.courtName ?? '').slice(0, 40), time: timeOf(m.schedule), a, b, sets: setsOf(m.teams) });
  }
  return out;
}

/** True when a response is the bot wall's page and not the API's JSON. */
export const isWall = (text) => /_Incapsula_Resource|hcaptcha|Request unsuccessful/i.test(String(text).slice(0, 2000)) && !/^\s*[\[{]/.test(text);

// ---------------------------------------------------------------- network

export const defaultProfile = () => process.env.ITF_PROFILE || path.join(os.homedir(), '.ita-itf', 'profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Edge with the saved profile, on an event's page of world.tennis (the API answers calls made from a page that has passed the wall).
 * `headed` shows the window so a person can solve the CAPTCHA. Returns { get(pathAndQuery) -> JSON, close() }.
 */
export async function openSession({ page: url, headed = false, profile = defaultProfile(), pace = 1500, log = console.log } = {}) {
  const { chromium } = await import('playwright-core');
  mkdirSync(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: !headed, viewport: { width: 1200, height: 900 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const ok = () => p.evaluate(() => !!document.body && /Tournament Information|Draw Size|Entry deadline/i.test(document.body.innerText)).catch(() => false);
  if (headed) {
    log('A window is open: solve the CAPTCHA there (up to 10 minutes) and leave it open.');
    for (let i = 0; i < 300 && !(await ok()); i++) await sleep(2000);
  } else for (let i = 0; i < 10 && !(await ok()); i++) await sleep(1500);
  if (!(await ok())) { await ctx.close(); throw new Error('the site asks for a CAPTCHA again: run once with --solve'); }
  let last = 0;
  const get = async (q, tries = 3, soft = false) => {
    await sleep(Math.max(0, last + pace - Date.now()));
    last = Date.now();
    const text = await p.evaluate(async (u) => (await fetch(u)).text(), API + q);
    try { return JSON.parse(text); } catch { /* the wall, or an error page */ }
    if (soft && isWall(text)) return null; // the caller can do without this one
    if (tries > 1 && isWall(text)) {
      // the page is loaded again, as a browser does when the wall interrupts: the bot wall renews what it gave and the call is made again
      log("  (the wall interrupted: loading the page again)");
      await sleep(8000);
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      for (let i = 0; i < 10 && !(await ok()); i++) await sleep(1500);
      last = Date.now();
      return get(q, tries - 1, soft);
    }
    throw new Error(`not JSON from ${q.slice(0, 60)}: ${String(text).slice(0, 60)}`);
  };
  return { get, close: () => ctx.close() };
}

/** Everything of one event: its draws and its matches (from the order of play of every day), read with a few calls. */
export async function readItfEvent(session, key, { log = console.log } = {}) {
  const k = key.toLowerCase();
  const filters = await session.get(`GetEventFilters?tournamentKey=${k}`);
  const draws = [];
  for (const d of drawsOf(filters)) {
    const sheet = await session.get(`GetDrawsheet?drawsheetStructureCode=${d.ds}&eventClassificationCode=${d.ec}&matchTypeCode=${d.mt}&playerTypeCode=${d.pt}&tourType=${filters.tourType}&tournamentId=${filters.tournamentId}&weekNumber=0`);
    const draw = drawFromSheet(sheet, d, drawOrder(d));
    if (draw.rounds.length) draws.push(draw);
  }
  const days = await session.get(`GetOrderOfPlayDays?tournamentKey=${k}`);
  const matches = [];
  const skipped = [], got = [];
  for (const d of days) {
    const day = String(d.playDate).slice(0, 10);
    // the site lets only the current day of play through to a program like this one: the other days are skipped (the draws hold their results) and the rows kept from earlier runs stay
    const courts = await session.get(`GetOrderOfPlay?orderOfPlayDayId=${d.orderOfPlayDayId}`, 1, true);
    if (!courts) { skipped.push(day); continue; }
    got.push(day);
    matches.push(...matchesFromOrderOfPlay(day, courts));
  }
  log(`${key}: ${draws.length} draw(s), ${matches.length} match(es) on ${got.length} day(s)${skipped.length ? `; not readable: ${skipped.join(", ")}` : ""}`);
  return { id: key.toUpperCase(), days: got.sort(), matches, draws };
}

const post = async (base, secret, body, headers = {}) => {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}`, ...headers }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 300) };
};

// ---------------------------------------------------------------- command line

if (process.argv[1] && process.argv[1].endsWith('itf.mjs')) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const key = opt('--key', 'J-J30-ISR-2026-001').toUpperCase();
  const slug = opt('--slug', 'j30-ramat-hasharon-(closed)');
  const session = await openSession({ page: eventPage(slug, key), headed: args.includes('--solve'), profile: opt('--profile', defaultProfile()) });
  try {
    if (args.includes('--solve') && args.length === 1) { console.log('Solved: the profile is saved.'); process.exit(0); }
    const r = await readItfEvent(session, key);
    if (opt('--dump')) { mkdirSync(opt('--dump'), { recursive: true }); writeFileSync(path.join(opt('--dump'), `${key}.json`), JSON.stringify(r)); }
    for (const d of r.draws) console.log(`  ${d.name}: ${d.rounds.map((x) => x.length).join('/')}`);
    const base = opt('--url', process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
    if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
    const secret = process.env.CRON_SECRET;
    if (!base || !secret) { console.error('--push needs --url <site> and CRON_SECRET in the environment.'); process.exit(1); }
    const bypass = process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : {};
    const [name, city, start, end] = [opt('--name'), opt('--city', ''), opt('--start'), opt('--end')];
    if (name && start && end) {
      const ev = { id: key, name, venue: opt('--venue', ''), city, country: opt('--country', 'Israel'), start, end, surface: opt('--surface', 'Hard'), category: opt('--category', 'J30'), age: null, closed: false, url: eventPage(slug, key) };
      const a = await post(base, secret, { kind: 'abroad', circuit: 'ITF', until: start, events: [ev] }, bypass);
      console.log(`push event: ${a.status} ${a.text}`);
      if (!a.ok) process.exit(1);
    }
    const b = await post(base, secret, { kind: 'abroad-results', results: [r] }, bypass);
    console.log(`push results: ${b.status} ${b.text}`);
    if (!b.ok) process.exit(1);
  } finally { await session.close(); }
}
