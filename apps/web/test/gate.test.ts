import { describe, expect, it } from 'vitest';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCompetitions, shouldSync } from '../scripts/loglig-sync/gate.mjs';

const comps = [
  { name: 'סבב זוגות', start: '2026-10-16', end: '2026-10-26' },
  { name: 'מאסטרס עכו', start: '2026-10-23', end: '2026-11-14' },
  { name: 'סוכות', start: '2026-09-18', end: '2026-10-03' },
];
// Israel is UTC+3 in late October 2026 (summer time ends on the 25th), so 10:00 there is 07:00 UTC
const at = (iso: string) => new Date(iso);

describe('10-minute sync gate', () => {
  it('runs inside the hours while a competition is on', () => {
    const r = shouldSync(at('2026-10-23T07:00:00Z'), comps);
    expect(r.run).toBe(true);
    expect(r.reason).toContain('2 competition(s)');
  });

  it('skips outside 9:00-19:00 Israel time, whatever the competitions', () => {
    expect(shouldSync(at('2026-10-23T05:30:00Z'), comps).run).toBe(false); // 08:30
    expect(shouldSync(at('2026-10-23T16:00:00Z'), comps).run).toBe(false); // 19:00 sharp is already out
    expect(shouldSync(at('2026-10-23T15:59:00Z'), comps).run).toBe(true); // 18:59
    expect(shouldSync(at('2026-10-23T06:00:00Z'), comps).run).toBe(true); // 09:00 sharp is in
  });

  it('skips when no competition is on, but wakes up the day before one starts', () => {
    expect(shouldSync(at('2026-10-05T07:00:00Z'), comps)).toMatchObject({ run: false });
    expect(shouldSync(at('2026-11-20T07:00:00Z'), comps)).toMatchObject({ run: false });
    expect(shouldSync(at('2026-09-17T07:00:00Z'), comps).run).toBe(true); // the day before the first starts
    expect(shouldSync(at('2026-09-16T07:00:00Z'), comps).run).toBe(false);
    expect(shouldSync(at('2026-10-04T07:00:00Z'), comps).run).toBe(false); // the day after one ends
    expect(shouldSync(at('2026-10-05T07:00:00Z'), comps, { grace: 0 }).run).toBe(false);
  });

  it('uses Israel\'s date, not the PC\'s: just after midnight there it is already the next day', () => {
    // 2026-10-02 22:30 UTC = 2026-10-03 01:30 Israel: outside the hours anyway, so look at the hour rule and the date rule together
    expect(shouldSync(at('2026-10-03T07:00:00Z'), comps).run).toBe(true); // last day of Sukkot
    expect(shouldSync(at('2026-10-02T21:30:00Z'), comps).run).toBe(false); // 00:30 on the 3rd, night
  });

  it('ignores malformed items', () => {
    expect(shouldSync(at('2026-10-23T07:00:00Z'), [{ name: 'x' }, null, { start: '2026-10-23' }])).toMatchObject({ run: false });
  });

  it('an unknown list runs inside the hours only', () => {
    expect(shouldSync(at('2026-10-23T07:00:00Z'), null).run).toBe(true);
    expect(shouldSync(at('2026-10-23T01:00:00Z'), null).run).toBe(false); // 04:00 at night
  });

  it('a missing or old saved list means "run", never silence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gate-'));
    expect(readCompetitions(dir)).toBeNull();
    writeFileSync(path.join(dir, 'competitions.json'), JSON.stringify(comps));
    expect(readCompetitions(dir)).toHaveLength(3);
    const old = new Date(Date.now() - 4 * 86400000);
    utimesSync(path.join(dir, 'competitions.json'), old, old);
    expect(readCompetitions(dir)).toBeNull();
    writeFileSync(path.join(dir, 'competitions.json'), '{not json');
    expect(readCompetitions(dir)).toBeNull();
  });
});
