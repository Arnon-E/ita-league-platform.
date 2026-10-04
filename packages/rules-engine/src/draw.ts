import { mulberry32, shuffle, type Rng } from './rng.js';
import { sortBySeedOrder, type RuleSet } from './ruleset.js';
import type { Entrant } from './types.js';

export type Slot = { kind: 'player'; player: Entrant; seed?: number } | { kind: 'bye' };

export interface DrawOptions {
  code: number;
  ruleSet: RuleSet;
  /** Override number of seeds (clamped to what the tier table supports). */
  seeds?: number;
  separateClubs?: boolean;
}

export interface DrawResult {
  code: number;
  size: number;
  slots: Slot[]; // index = position - 1
  seeded: Entrant[];
}

export function drawSizeFor(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

function partnerIndex(i: number): number {
  return i % 2 === 0 ? i + 1 : i - 1;
}

function clubClashes(slots: (Slot | undefined)[]): number {
  let c = 0;
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a?.kind === 'player' && b?.kind === 'player' && a.player.club && a.player.club === b.player.club) c++;
  }
  return c;
}

export function makeDraw(entrants: readonly Entrant[], opts: DrawOptions): DrawResult {
  if (entrants.length < 2) throw new Error('A draw needs at least 2 entrants');
  const rng: Rng = mulberry32(opts.code);
  const size = drawSizeFor(entrants.length);
  const tiers = opts.ruleSet.seedTiers[size];
  if (!tiers) throw new Error(`No seed table for draw size ${size}`);

  const ordered = sortBySeedOrder(entrants);
  const maxSeeds = tiers.reduce((s, t) => s + t.length, 0);
  const wanted = Math.min(opts.seeds ?? opts.ruleSet.seedCount(entrants.length), maxSeeds, entrants.length);
  const seeded = ordered.slice(0, wanted).filter((e) => e.rank !== undefined);
  const unseeded = ordered.filter((e) => !seeded.includes(e));

  const slots: (Slot | undefined)[] = new Array(size).fill(undefined);

  // Seeds fill tiers in order; within a tier positions are drawn at random.
  let k = 0;
  for (const tier of tiers) {
    const members = seeded.slice(k, k + tier.length);
    if (members.length === 0) break;
    const positions = tier.length === 1 ? tier.slice() : shuffle(tier, rng);
    members.forEach((p, i) => {
      slots[(positions[i] as number) - 1] = { kind: 'player', player: p, seed: k + i + 1 };
    });
    k += members.length;
  }

  // Byes go next to the top seeds.
  const byes = size - entrants.length;
  let given = 0;
  for (let s = 1; given < byes && s <= seeded.length; s++) {
    const idx = slots.findIndex((x) => x?.kind === 'player' && x.seed === s);
    const pi = partnerIndex(idx);
    if (slots[pi] === undefined) {
      slots[pi] = { kind: 'bye' };
      given++;
    }
  }
  // Remaining byes (more byes than seeds): put them in free slots whose partner is a player.
  for (let i = 0; given < byes && i < size; i++) {
    if (slots[i] === undefined && slots[partnerIndex(i)]?.kind === 'player') {
      slots[i] = { kind: 'bye' };
      given++;
    }
  }

  const free: number[] = [];
  slots.forEach((s, i) => { if (s === undefined) free.push(i); });

  const place = (order: Entrant[]) => {
    const copy = slots.slice();
    free.forEach((pos, i) => { copy[pos] = { kind: 'player', player: order[i] as Entrant }; });
    return copy;
  };

  let best = place(shuffle(unseeded, rng));
  if (opts.separateClubs) {
    let bestScore = clubClashes(best);
    for (let attempt = 0; attempt < 300 && bestScore > 0; attempt++) {
      const cand = place(shuffle(unseeded, rng));
      const sc = clubClashes(cand);
      if (sc < bestScore) { best = cand; bestScore = sc; }
    }
  }
  return { code: opts.code, size, slots: best as Slot[], seeded };
}

/** Manual swap by a tournament manager. Caller logs it in the audit trail. */
export function swapSlots(draw: DrawResult, i: number, j: number): DrawResult {
  const slots = draw.slots.slice();
  const a = slots[i];
  const b = slots[j];
  if (!a || !b) throw new Error('Slot out of range');
  slots[i] = b;
  slots[j] = a;
  return { ...draw, slots };
}
