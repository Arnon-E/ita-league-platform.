import type { Entrant } from './types.js';

/**
 * Versioned, configurable rules. Defaults are taken from ITA documents
 * (see docs/ita-sources.md) and MUST be verified against the originals.
 */
export interface RuleSet {
  id: string;
  version: number;
  /** Seed tiers per draw size: tier i -> positions (1-indexed) that tier is drawn into. */
  seedTiers: Record<number, number[][]>;
  /** Max seeds by number of entrants. */
  seedCount: (entrants: number) => number;
  tieBreakOrder: TieBreakKey[];
  group: {
    minPlayers: number;
    voidIfPlayedLessThan: number; // ratio of group matches
    walkoverCountsInStats: boolean;
  };
  refund: RefundPolicy;
  ranking: { windowWeeks: number; bestSingles: number; bestDoubles: number };
  /** Base ranking points by round reached (W, F, SF, QF, R16..., G = group exit). */
  points: Record<string, number>;
  /** Named points tables per tournament level (e.g. national grade 1 / 2), selectable per tournament. */
  pointsTables: Record<string, Record<string, number>>;
  /** True only after the federation checked every number against its official documents. */
  verified: boolean;
}

export type TieBreakKey = 'wins' | 'headToHead' | 'setDiff' | 'gameDiff' | 'draw';

export interface RefundPolicy {
  beforeRegistrationClose: number; // fraction refunded
  afterCloseBeforeDraw: number;
  afterDraw: number;
  medicalCertificateOverride: boolean;
}

const t = (...n: number[]) => n;

export const ITA_DEFAULT_RULESET: RuleSet = {
  id: 'ita-default',
  version: 1,
  seedTiers: {
    2: [t(1), t(2)],
    4: [t(1), t(4)],
    8: [t(1), t(8), t(3, 6)],
    16: [t(1), t(16), t(5, 12)],
    32: [t(1), t(32), t(9, 24), t(8, 16, 17, 25)],
    64: [t(1), t(64), t(17, 48), t(16, 32, 33, 49), t(8, 9, 24, 25, 40, 41, 56, 57)],
    128: [
      t(1), t(128), t(33, 96), t(32, 64, 65, 97),
      t(16, 17, 48, 49, 80, 81, 112, 113),
      t(8, 9, 24, 25, 40, 41, 56, 57, 72, 73, 88, 89, 104, 105, 120, 121),
    ],
  },
  seedCount: (n) => (n >= 97 ? 32 : n >= 49 ? 16 : n >= 25 ? 8 : n >= 13 ? 4 : n >= 4 ? 2 : 0),
  tieBreakOrder: ['wins', 'headToHead', 'setDiff', 'gameDiff', 'draw'],
  group: { minPlayers: 3, voidIfPlayedLessThan: 0.5, walkoverCountsInStats: false },
  refund: {
    beforeRegistrationClose: 1,
    afterCloseBeforeDraw: 1,
    afterDraw: 0,
    medicalCertificateOverride: false,
  },
  ranking: { windowWeeks: 52, bestSingles: 6, bestDoubles: 4 },
  points: { W: 100, F: 70, SF: 50, QF: 35, R16: 20, R32: 12, R64: 6, R128: 3, G: 5 },
  // National youth tournaments, ITA youth procedures (Sep 2026, pp. 23-24, from an automatic summary: VERIFY).
  pointsTables: {
    NATIONAL_GRADE1: { W: 1000, F: 750, SF: 625, QF: 550, R16: 500, R32: 330, R64: 200 },
    NATIONAL_GRADE2: { W: 750, F: 565, SF: 470, QF: 415, R16: 375, R32: 270, R64: 150 },
  },
  verified: false,
};

export function sortBySeedOrder(entrants: readonly Entrant[]): Entrant[] {
  return entrants.slice().sort((x, y) => {
    const rx = x.rank ?? Number.POSITIVE_INFINITY;
    const ry = y.rank ?? Number.POSITIVE_INFINITY;
    if (rx !== ry) return rx - ry;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
}
