export interface Entrant {
  id: string;
  name: string;
  club?: string;
  /** Official ranking position on draw day (1 = best). Undefined = unranked. */
  rank?: number;
}

export interface SetScore {
  a: number;
  b: number;
  /** 10-point match tiebreak played instead of a set. Counts as one set, one game. */
  superTb?: boolean;
}

export type MatchStatus = 'scheduled' | 'completed' | 'walkover' | 'retired' | 'void';

export interface MatchResult {
  id: string;
  a: string;
  b: string;
  status: MatchStatus;
  sets: SetScore[];
  /** For walkover/retired: the player who did not play / retired. */
  absent?: string;
}
