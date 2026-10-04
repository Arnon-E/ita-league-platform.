import type { Slot } from './draw.js';
import type { Entrant } from './types.js';

export interface BracketMatch {
  id: string; // r{round}m{n}, round 1 = first round
  round: number;
  index: number;
  a?: Entrant;
  b?: Entrant;
  winner?: Entrant;
  bye?: boolean;
}

export interface Bracket {
  rounds: BracketMatch[][];
}

export function roundName(round: number, totalRounds: number): string {
  const left = totalRounds - round;
  return ['גמר', 'חצי גמר', 'רבע גמר'][left] ?? `סיבוב ${round}`;
}

export function buildBracket(slots: readonly Slot[]): Bracket {
  const rounds: BracketMatch[][] = [];
  const first: BracketMatch[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const sa = slots[i] as Slot;
    const sb = slots[i + 1] as Slot;
    const m: BracketMatch = { id: `r1m${i / 2 + 1}`, round: 1, index: i / 2 };
    if (sa.kind === 'player') m.a = sa.player;
    if (sb.kind === 'player') m.b = sb.player;
    if (sa.kind === 'bye' || sb.kind === 'bye') {
      m.bye = true;
      m.winner = sa.kind === 'player' ? sa.player : sb.kind === 'player' ? sb.player : undefined;
    }
    first.push(m);
  }
  rounds.push(first);
  let prev = first;
  let r = 2;
  while (prev.length > 1) {
    const cur: BracketMatch[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      cur.push({ id: `r${r}m${i / 2 + 1}`, round: r, index: i / 2 });
    }
    rounds.push(cur);
    prev = cur;
    r++;
  }
  const b = { rounds };
  rounds.forEach((_, ri) => propagate(b, ri));
  return b;
}

function propagate(b: Bracket, ri: number) {
  const cur = b.rounds[ri] as BracketMatch[];
  const next = b.rounds[ri + 1];
  if (!next) return;
  cur.forEach((m, i) => {
    const target = next[Math.floor(i / 2)] as BracketMatch;
    if (m.winner) {
      if (i % 2 === 0) target.a = m.winner; else target.b = m.winner;
    }
  });
  // a match with one real player and a bye feeder resolves automatically
  next.forEach((m) => {
    if (m.winner) return;
  });
}

export function recordWinner(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })));
  const out: Bracket = { rounds };
  for (let ri = 0; ri < rounds.length; ri++) {
    const m = (rounds[ri] as BracketMatch[]).find((x) => x.id === matchId);
    if (!m) continue;
    const w = [m.a, m.b].find((p) => p?.id === winnerId);
    if (!w) throw new Error('Winner must be one of the match players');
    const prev = m.winner;
    m.winner = w;
    // changing a winner clears downstream results
    if (prev && prev.id !== w.id) clearDownstream(out, ri, m.index);
    propagate(out, ri);
    return out;
  }
  throw new Error(`Unknown match ${matchId}`);
}

function clearDownstream(b: Bracket, ri: number, index: number) {
  let idx = index;
  for (let r = ri + 1; r < b.rounds.length; r++) {
    const m = (b.rounds[r] as BracketMatch[])[Math.floor(idx / 2)] as BracketMatch;
    if (idx % 2 === 0) m.a = undefined; else m.b = undefined;
    m.winner = undefined;
    idx = Math.floor(idx / 2);
  }
}
