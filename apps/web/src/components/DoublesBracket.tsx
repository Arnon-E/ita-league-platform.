import { BracketView, type BracketCell, type BracketSide } from '@/components/BracketView';

/** A knockout tree as the importer stores it: the leaves are the first-round pairs, an inner node holds the winner's name ('' until it is played). */
export interface BracketTree { n: string; c: BracketTree[] }
/** A played or scheduled knockout match of the category, to put its sets in the tree. */
export interface BracketResult { a: string[]; b: string[]; sets: { a: number; b: number }[]; status: string; winner: 'a' | 'b' | null; meta?: string }

const key = (names: string[]) => names.join(' / ').toLowerCase().replace(/\s+/g, ' ').trim();
const nameOf = (n: BracketTree) => n.n;

/** The depth of the deepest match (an inner node is a match; a leaf is a first-round pair). */
const depthOf = (n: BracketTree): number => (n.c.length ? 1 + Math.max(...n.c.map(depthOf)) : 0);

/**
 * The doubles knockout tree drawn exactly like the singles one (same columns, boxes and lines): every inner node of Loglig's tree is a match
 * between what its two children hold (a pair on a leaf, the winner of that match above it). The sets come from the matches already imported.
 */
export function DoublesBracket({ tree, results, tt, pending }: { tree: BracketTree; results: BracketResult[]; tt: (s: string) => string; pending: string }) {
  const depth = depthOf(tree); // number of columns
  const cols: (BracketCell | null)[][] = Array.from({ length: depth }, (_, d) => Array<BracketCell | null>(2 ** d).fill(null)); // cols[0] = the final
  const put = (n: BracketTree, d: number, i: number) => {
    if (!n.c.length) return;
    const [x, y] = n.c as [BracketTree, BracketTree | undefined];
    const an = nameOf(x), bn = y ? nameOf(y) : '';
    const found = an && bn ? results.find((r) => (key(r.a) === key([an]) && key(r.b) === key([bn])) || (key(r.a) === key([bn]) && key(r.b) === key([an]))) : undefined;
    const flipped = !!found && key(found.a) !== key([an]);
    const mk = (name: string, mine: 'a' | 'b'): BracketSide => {
      const m = found && (flipped ? (mine === 'a' ? 'b' : 'a') : mine);
      const done = !!found && found.status !== 'SCHEDULED' && found.status !== 'VOID';
      return {
        names: name ? name.split(' / ') : [],
        win: !!name && (n.n === name || (!!found && done && found.winner === m)),
        sets: !found || !done ? null : found.status === 'WALKOVER' && !found.sets.length ? (found.winner === m ? 'W/O' : '') : found.sets.map((s, k) => <b key={k}>{m === 'a' ? s.a : s.b}</b>),
      };
    };
    cols[d]![i] = { a: mk(an, 'a'), b: mk(bn, 'b'), meta: found?.meta || undefined };
    put(x, d + 1, 2 * i);
    if (y) put(y, d + 1, 2 * i + 1);
  };
  put(tree, 0, 0);
  return <BracketView cols={cols.reverse()} tt={tt} pending={pending} />;
}
