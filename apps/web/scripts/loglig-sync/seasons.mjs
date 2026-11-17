// Loglig's seasons (union 38), read from Loglig itself so the syncs follow a new season on their own: the federation opens one each
// January (2026 = 1755, opened 15.1.2026), and a hard-coded id would quietly miss every competition of the next one.
//   recent: the two newest seasons, newest first: the competition lists are read for both (around January, December's
//           competitions are still in the old season while January's are already in the new one)
//   active: the newest season that has started (rankings and leagues)
// Cached for 12 hours in the dump folder (seasons.json); when Loglig does not answer, the cache of any age, else the 2026 ids.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK = [{ Id: 1755, startDate: '2026-01-15T21:45:00' }, { Id: 1671, startDate: '2025-01-01T00:00:00' }];
const URL = 'https://loglig.com:8443/api/Leauges/AthleticsSeasons/38';

/** Loglig's season list -> { recent: [newest, previous], active }. Pure, for the tests. */
export function pickSeasons(list, now = new Date()) {
  const s = (Array.isArray(list) ? list : []).filter((x) => Number.isInteger(x?.Id) && !Number.isNaN(Date.parse(x?.startDate)))
    .sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
  if (!s.length) return pickSeasons(FALLBACK, now);
  const active = (s.find((x) => Date.parse(x.startDate) <= now.getTime()) ?? s[0]).Id;
  return { recent: s.slice(0, 2).map((x) => x.Id), active };
}

export async function loglogSeasons(now = new Date()) {
  const dir = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump');
  const file = path.join(dir, 'seasons.json');
  const cached = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
  if (existsSync(file) && now.getTime() - statSync(file).mtimeMs < 12 * 3600e3 && cached()) return pickSeasons(cached(), now);
  try {
    const r = await fetch(URL, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } });
    if (!r.ok) throw new Error(String(r.status));
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) throw new Error('empty season list');
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(list), 'utf8');
    return pickSeasons(list, now);
  } catch (e) {
    console.warn('  Loglig seasons not read, using', cached() ? 'the saved list' : 'the 2026 ids', String(e.message).slice(0, 60));
    return pickSeasons(cached() ?? FALLBACK, now);
  }
}
