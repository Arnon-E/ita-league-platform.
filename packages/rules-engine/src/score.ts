import type { MatchResult, SetScore } from './types.js';

export interface MatchFormat {
  setsToWin: number; // 2 = best of 3
  /** What the deciding set is. */
  decider: 'set' | 'superTb';
}

export const BEST_OF_3_SUPER_TB: MatchFormat = { setsToWin: 2, decider: 'superTb' };
export const BEST_OF_3: MatchFormat = { setsToWin: 2, decider: 'set' };

export function isValidSet(s: SetScore): boolean {
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  if (s.a < 0 || s.b < 0 || s.a === s.b) return false;
  if (s.superTb) return hi >= 10 && hi - lo >= 2 && (hi === 10 ? true : hi - lo === 2);
  if (hi === 6) return lo <= 4;
  if (hi === 7) return lo === 5 || lo === 6;
  return false;
}

export interface MatchOutcome {
  winner: 'a' | 'b';
  setsA: number;
  setsB: number;
}

/** Validates a completed match score and returns the winner. Throws on an invalid score. */
export function resolveCompleted(sets: readonly SetScore[], format: MatchFormat): MatchOutcome {
  let setsA = 0;
  let setsB = 0;
  const maxSets = format.setsToWin * 2 - 1;
  if (sets.length < format.setsToWin || sets.length > maxSets) throw new Error('Invalid number of sets');
  sets.forEach((s, i) => {
    if (setsA === format.setsToWin || setsB === format.setsToWin) throw new Error('Sets after the match was decided');
    const isDecider = i === maxSets - 1;
    if (s.superTb && !(isDecider && format.decider === 'superTb')) throw new Error('Super tiebreak is only allowed as the deciding set');
    if (!s.superTb && isDecider && format.decider === 'superTb') throw new Error('Deciding set must be a super tiebreak');
    if (!isValidSet(s)) throw new Error(`Invalid set score ${s.a}-${s.b}`);
    if (s.a > s.b) setsA++; else setsB++;
  });
  if (setsA !== format.setsToWin && setsB !== format.setsToWin) throw new Error('Match is not finished');
  return { winner: setsA > setsB ? 'a' : 'b', setsA, setsB };
}

/** Winner of a result of any status (completed / walkover / retired). */
export function winnerOf(m: MatchResult, format: MatchFormat): 'a' | 'b' | undefined {
  if (m.status === 'walkover' || m.status === 'retired') {
    if (!m.absent) throw new Error('absent player required');
    return m.absent === m.a ? 'b' : 'a';
  }
  if (m.status === 'completed') return resolveCompleted(m.sets, format).winner;
  return undefined;
}
