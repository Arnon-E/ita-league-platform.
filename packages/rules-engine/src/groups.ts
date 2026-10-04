import { mulberry32 } from './rng.js';
import { sortBySeedOrder, type RuleSet, type TieBreakKey } from './ruleset.js';
import { winnerOf, type MatchFormat } from './score.js';
import type { Entrant, MatchResult } from './types.js';

export interface GroupConfig {
  groupSize: number; // preferred size, e.g. 4
  groupCount?: number; // overrides size when set
  advancers: number; // players advancing from each group
}

/** Group sizes differ by at most 1, so partial groups (e.g. 4,4,4,3) are balanced. */
export function groupSizes(n: number, cfg: GroupConfig): number[] {
  const count = cfg.groupCount ?? Math.ceil(n / cfg.groupSize);
  const base = Math.floor(n / count);
  const extra = n % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Snake distribution by ranking so groups are balanced. Unranked fill last. */
export function makeGroups(entrants: readonly Entrant[], cfg: GroupConfig): Entrant[][] {
  const sizes = groupSizes(entrants.length, cfg);
  const ordered = sortBySeedOrder(entrants);
  const groups: Entrant[][] = sizes.map(() => []);
  let dir = 1;
  let g = 0;
  for (const p of ordered) {
    let guard = 0;
    while ((groups[g] as Entrant[]).length >= (sizes[g] as number) && guard++ < sizes.length * 2) {
      g += dir;
      if (g < 0 || g >= groups.length) { dir = -dir; g += dir; }
    }
    (groups[g] as Entrant[]).push(p);
    g += dir;
    if (g < 0 || g >= groups.length) { dir = -dir; g += dir; }
  }
  return groups;
}

export interface Fixture { round: number; a: string; b: string }

/** Round robin by the circle method. Odd groups get a rest round (bye). */
export function roundRobin(ids: readonly string[]): Fixture[] {
  const list: (string | null)[] = ids.slice();
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const out: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i] as string | null;
      const b = list[n - 1 - i] as string | null;
      if (a && b) out.push({ round: r + 1, a, b });
    }
    list.splice(1, 0, list.pop() as string | null);
  }
  return out;
}

export interface Standing {
  id: string;
  played: number;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  rank: number;
}

interface Tally {
  played: number; wins: number; losses: number;
  sf: number; sa: number; gf: number; ga: number;
}

function emptyTally(): Tally {
  return { played: 0, wins: 0, losses: 0, sf: 0, sa: 0, gf: 0, ga: 0 };
}

function countable(matches: readonly MatchResult[]): MatchResult[] {
  return matches.filter((m) => m.status === 'completed' || m.status === 'walkover' || m.status === 'retired');
}

function tally(ids: readonly string[], matches: readonly MatchResult[], fmt: MatchFormat, rules: RuleSet): Map<string, Tally> {
  const t = new Map(ids.map((id) => [id, emptyTally()]));
  for (const m of countable(matches)) {
    const ta = t.get(m.a);
    const tb = t.get(m.b);
    if (!ta || !tb) continue;
    const w = winnerOf(m, fmt);
    if (!w) continue;
    ta.played++; tb.played++;
    (w === 'a' ? ta : tb).wins++;
    (w === 'a' ? tb : ta).losses++;
    const skipStats = m.status === 'walkover' && !rules.group.walkoverCountsInStats;
    if (skipStats) continue;
    for (const s of m.sets) {
      const gA = s.superTb ? (s.a > s.b ? 1 : 0) : s.a;
      const gB = s.superTb ? (s.b > s.a ? 1 : 0) : s.b;
      ta.gf += gA; ta.ga += gB; tb.gf += gB; tb.ga += gA;
      if (s.a > s.b) { ta.sf++; tb.sa++; } else { tb.sf++; ta.sa++; }
    }
  }
  return t;
}

/**
 * Standings with a configurable tie-break order.
 * Head-to-head among 3+ tied players uses a mini-table (wins, then set diff, then game diff);
 * if it separates only some of them, the rest are re-ordered from the head-to-head step.
 * A withdrawn player's matches are voided if he played less than the configured share of the group.
 */
export function computeStandings(
  ids: readonly string[],
  matches: readonly MatchResult[],
  rules: RuleSet,
  fmt: MatchFormat,
  opts: { drawCode?: number; withdrawn?: readonly string[] } = {},
): Standing[] {
  let ms = countable(matches);
  for (const w of opts.withdrawn ?? []) {
    const played = ms.filter((m) => (m.a === w || m.b === w) && m.status === 'completed').length;
    if (played < rules.group.voidIfPlayedLessThan * Math.max(1, ids.length - 1)) {
      ms = ms.filter((m) => m.a !== w && m.b !== w);
    }
  }
  const all = tally(ids, ms, fmt, rules);
  const rng = mulberry32(opts.drawCode ?? 1);
  const lot = new Map(ids.map((id) => [id, rng()]));

  const bucketize = (group: string[], score: (id: string) => number[]): string[][] => {
    const cmp = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (b[i] as number) - (a[i] as number);
      return 0;
    };
    const sorted = group.slice().sort((x, y) => cmp(score(x), score(y)));
    const out: string[][] = [];
    for (const id of sorted) {
      const last = out[out.length - 1];
      if (last && cmp(score(last[0] as string), score(id)) === 0) last.push(id);
      else out.push([id]);
    }
    return out;
  };

  const order = (group: string[], keys: TieBreakKey[]): string[] => {
    if (group.length <= 1 || keys.length === 0) return group;
    const key = keys[0] as TieBreakKey;
    const rest = keys.slice(1);
    let score: (id: string) => number[];
    if (key === 'headToHead') {
      const mini = tally(group, ms.filter((m) => group.includes(m.a) && group.includes(m.b)), fmt, rules);
      score = (id) => {
        const x = mini.get(id) as Tally;
        return [x.wins, x.sf - x.sa, x.gf - x.ga];
      };
    } else if (key === 'wins') score = (id) => [(all.get(id) as Tally).wins];
    else if (key === 'setDiff') score = (id) => [(all.get(id) as Tally).sf - (all.get(id) as Tally).sa];
    else if (key === 'gameDiff') score = (id) => [(all.get(id) as Tally).gf - (all.get(id) as Tally).ga];
    else score = (id) => [lot.get(id) as number];

    const out: string[] = [];
    for (const b of bucketize(group, score)) {
      if (b.length === 1) out.push(...b);
      else if (key === 'headToHead' && b.length < group.length) out.push(...order(b, keys));
      else out.push(...order(b, rest));
    }
    return out;
  };

  return order(ids.slice(), rules.tieBreakOrder).map((id, i) => {
    const x = all.get(id) as Tally;
    return {
      id, played: x.played, wins: x.wins, losses: x.losses,
      setsFor: x.sf, setsAgainst: x.sa, gamesFor: x.gf, gamesAgainst: x.ga, rank: i + 1,
    };
  });
}

/** Players advancing: top N of each group; extra best-third slots can be added by the manager. */
export function advancers(groupsStandings: Standing[][], perGroup: number): string[] {
  return groupsStandings.flatMap((s) => s.slice(0, perGroup).map((x) => x.id));
}
