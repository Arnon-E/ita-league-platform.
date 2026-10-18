/** A knockout match as the bracket needs it. */
export interface BracketMatch { id: string; round: number; index: number; aEntryId: string | null; bEntryId: string | null; winnerEntryId: string | null }

/**
 * Lays out a knockout draw as a tree: one column per round, from the first round to the final, each column with half the slots of
 * the one before. Every match sits above the two matches its players came from, so the lines between columns connect the right
 * boxes. Classification matches (third place, consolation: players who lost in an earlier round) are not part of the tree, and a
 * slot is empty for a bye or a round not played yet.
 */
export function bracketLayout<M extends BracketMatch>(all: M[]): { cols: (M | null)[][] } | null {
  if (!all.length) return null;
  const r0 = Math.min(...all.map((m) => m.round));
  const byRound = new Map<number, M[]>();
  for (const m of [...all].sort((x, y) => x.index - y.index)) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]);
  const last = Math.max(...all.map((m) => m.round));

  // the main draw: the first round, then matches whose players all won their previous main match (or had a bye until now)
  const main = new Map<number, M[]>();
  const seenBefore = new Set<string>();
  for (let r = r0; r <= last; r++) {
    const winners = new Set((main.get(r - 1) ?? []).map((m) => m.winnerEntryId).filter(Boolean) as string[]);
    const fed = (byRound.get(r) ?? []).filter((m) => r === r0 || [m.aEntryId, m.bEntryId].every((e) => !e || winners.has(e) || !seenBefore.has(e)));
    // a third-place match listed in the semifinal round: both its players also play another match of the same round
    const times = new Map<string, number>();
    for (const m of fed) for (const e of [m.aEntryId, m.bEntryId]) if (e) times.set(e, (times.get(e) ?? 0) + 1);
    main.set(r, fed.filter((m) => { const es = [m.aEntryId, m.bEntryId].filter(Boolean) as string[]; return !es.length || !es.every((e) => times.get(e)! > 1); }));
    for (const m of byRound.get(r) ?? []) for (const e of [m.aEntryId, m.bEntryId]) if (e) seenBefore.add(e);
  }

  // size of the first round: enough slots for every round's matches, a power of two (so the tree ends in one final)
  let slots = 1;
  for (const [r, ms] of main) slots = Math.max(slots, ms.length * 2 ** (r - r0));
  slots = 2 ** Math.ceil(Math.log2(Math.max(1, slots)));
  const depth = Math.log2(slots) + 1;

  // place from the final down: a match's two feeders go under it, matches with no parent yet fill the free slots in draw order
  const cols: (M | null)[][] = Array.from({ length: depth }, (_, k) => Array<M | null>(slots / 2 ** k).fill(null));
  for (let k = depth - 1; k >= 0; k--) {
    const col = cols[k]!;
    const pool = [...(main.get(r0 + k) ?? [])];
    const take = (entry: string | null) => {
      const i = entry ? pool.findIndex((m) => m.winnerEntryId === entry && (m.aEntryId === entry || m.bEntryId === entry)) : -1;
      return i < 0 ? null : pool.splice(i, 1)[0]!;
    };
    if (k < depth - 1) {
      cols[k + 1]!.forEach((parent, j) => {
        if (!parent) return;
        col[2 * j] = take(parent.aEntryId);
        col[2 * j + 1] = take(parent.bEntryId);
      });
    }
    for (let j = 0; j < col.length && pool.length; j++) if (!col[j] && !(k < depth - 1 && cols[k + 1]![j >> 1])) col[j] = pool.shift()!;
    for (let j = 0; j < col.length && pool.length; j++) if (!col[j]) col[j] = pool.shift()!;
  }
  return { cols };
}

/** Name of a round by its distance from the final. */
export const roundName = (fromFinal: number) => (['גמר', 'חצי גמר', 'רבע גמר', 'שמינית גמר'][fromFinal] ?? null);
