import { describe, expect, it } from 'vitest';
import { bracketLayout, type BracketMatch } from '@/services/bracket';

let n = 0;
const m = (round: number, a: string | null, b: string | null, winner: string | null = a): BracketMatch => ({ id: `m${++n}`, round, index: n, aEntryId: a, bEntryId: b, winnerEntryId: winner });
const names = (col: (BracketMatch | null)[]) => col.map((x) => (x ? `${x.aEntryId}-${x.bEntryId}` : '·'));

describe('knockout bracket layout', () => {
  it('puts every match above the two matches its players came from, and leaves out the third-place match', () => {
    // listed out of order on purpose; semifinal losers C and F play for third place in the semifinal round
    const ms = [
      m(1, 'E', 'F'), m(1, 'A', 'B'), m(1, 'G', 'H', 'H'), m(1, 'C', 'D', 'D'),
      m(2, 'E', 'H'), m(2, 'A', 'D'), m(2, 'C', 'F', 'C'),
      m(3, 'A', 'E', 'E'),
    ];
    const out = bracketLayout(ms)!;
    expect(out.cols.length).toBe(3);
    expect(names(out.cols[2]!)).toEqual(['A-E']);
    expect(names(out.cols[1]!)).toEqual(['A-D', 'E-H']);
    expect(names(out.cols[0]!)).toEqual(['A-B', 'C-D', 'E-F', 'G-H']);
  });

  it('leaves out a third-place match listed in the same round as the semifinals', () => {
    const ms = [
      m(1, 'A', 'B'), m(1, 'C', 'D', 'D'), m(1, 'E', 'F'), m(1, 'G', 'H', 'H'),
      m(2, 'D', 'H', 'H'), m(2, 'A', 'D'), m(2, 'E', 'H'), // D-H: the semifinal losers play for third place
      m(3, 'A', 'E', 'E'),
    ];
    const out = bracketLayout(ms)!;
    expect(out.cols.length).toBe(3);
    expect(names(out.cols[1]!)).toEqual(['A-D', 'E-H']);
  });

  it('keeps byes and rounds not played yet as empty slots', () => {
    // a draw of 6 in 8: A and E have byes into round 2; round 3 not played yet
    const ms = [m(1, 'B', 'C'), m(1, 'F', 'G', 'G'), m(2, 'A', 'B'), m(2, 'E', 'G', 'G')];
    const out = bracketLayout(ms)!;
    expect(out.cols.map((c) => c.length)).toEqual([4, 2, 1]);
    expect(names(out.cols[2]!)).toEqual(['·']);
    expect(names(out.cols[1]!)).toEqual(['A-B', 'E-G']);
    expect(names(out.cols[0]!).filter((x) => x !== '·')).toEqual(['B-C', 'F-G']);
  });

  it('a draw with only the first round played yet still shows the whole tree', () => {
    const out = bracketLayout([m(1, 'A', 'B', null), m(1, 'C', 'D', null)])!;
    expect(out.cols.map((c) => c.length)).toEqual([2, 1]);
    expect(bracketLayout([])).toBeNull();
  });
});
