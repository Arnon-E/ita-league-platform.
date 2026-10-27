import { memo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type * as api from './api';
import { bracketLayout, roundName } from './bracketLayout';
import { tr } from './i18n';
import { courtText, whenOf } from './MatchCard';
import { T } from './theme';

const CELL = 96; // height of one first-round slot; later rounds take 2, 4, 8... of them, so every box sits between its two feeders
const GAP = 24; // space between rounds, half of it on each side for the connecting lines

/** One side of a bracket box: the name(s) (a pair has two), whether it won / is the viewer's own, and its sets ('W/O' for a walkover win). */
export interface BracketSide { names: string[]; win?: boolean; me?: boolean; sets: string[] | 'W/O' | null }
/** A match box; `meta` is when and where it is played. */
export interface BracketCell { a: BracketSide; b: BracketSide; meta?: string; match?: api.Match }

/**
 * The knockout draw as a tree, as on the website: a column per round from the first round to the final (cols[0] is the first round, each
 * column with half the slots of the one before; null = a bye or a round not played yet), each pair of matches joined by a bracket line
 * to the match it leads to, a score per set, the winner in bold. `extra` boxes (places 3-4) sit next to the tree. Scrolls sideways; follows
 * the language's direction.
 */
const BracketGrid = memo(function BracketGrid({ cols, extra = [], onPress }: { cols: (BracketCell | null)[][]; extra?: { title: string; cell: BracketCell }[]; onPress?: (m: api.Match) => void }) {
  const height = cols[0]!.length * CELL;
  const side = (s: BracketSide) => (
    <View style={[b.row, s.me && b.me]}>
      <View style={{ flex: 1 }}>
        {s.names.length
          ? s.names.map((n) => <Text key={n} style={[b.name, s.win && b.won]} numberOfLines={1}>{n}</Text>)
          : <Text style={b.name} numberOfLines={1}>{tr('טרם נקבע')}</Text>}
      </View>
      <View style={b.sets}>
        {s.sets === 'W/O' ? <Text style={b.wo}>W/O</Text> : (s.sets ?? []).map((x, i) => <Text key={i} style={[b.set, s.win && b.setWon]}>{x}</Text>)}
      </View>
    </View>
  );
  const content = (c: BracketCell) => (
    <>{side(c.a)}<View style={b.rowB}>{side(c.b)}</View>{!!c.meta && <Text style={b.meta} numberOfLines={1}>{c.meta}</Text>}</>
  );
  const press = (c: BracketCell, children: ReactNode) => (
    <Pressable style={({ pressed }) => [b.box, pressed && { opacity: 0.8 }]} disabled={!onPress || !c.match} onPress={() => c.match && onPress?.(c.match)}>{children}</Pressable>
  );
  const box = (c: BracketCell | null, k: number, key: number) => (
    <View key={key} style={[b.cell, { height: CELL * 2 ** k }]}>
      {k > 0 && <View style={b.inLine} />}
      {c ? press(c, content(c)) : <View style={[b.box, b.empty, k === 0 && { opacity: 0 }]} />}
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 2 }}>
      <View style={b.tree}>
        {cols.map((col, k) => {
          const title = roundName(cols.length - 1 - k);
          return (
            <View key={k} style={b.col}>
              <Text style={b.title}>{title ? tr(title) : tr('סיבוב {n}', { n: k + 1 })}</Text>
              <View style={{ height }}>
                {col.length === 1 ? box(col[0]!, k, 0) : Array.from({ length: col.length / 2 }, (_, j) => (
                  <View key={j} style={{ height: CELL * 2 ** (k + 1) }}>
                    {box(col[2 * j]!, k, 0)}{box(col[2 * j + 1]!, k, 1)}
                    <View style={[b.pairLine, { top: CELL * 2 ** k / 2, height: CELL * 2 ** k }]} />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
      {extra.length > 0 && (
        <View style={[b.tree, { alignSelf: 'flex-end' }]}>
          {extra.map((x, i) => (
            <View key={i} style={b.col}>
              <Text style={b.title}>{x.title}</Text>
              {press(x.cell, content(x.cell))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
});

/** The knockout draw of one singles category. The viewer's own player (me) is marked; classification matches (places 3-4) get a box next to the tree. */
export const Bracket = memo(BracketImpl);
function BracketImpl({ matches, me, onPress }: { matches: api.Match[]; me?: string; onPress?: (m: api.Match) => void }) {
  const tree = bracketLayout(matches.map((m, i) => ({ ...m, index: m.index ?? i, aEntryId: m.a.id, bEntryId: m.b.id, winnerEntryId: m.winnerEntryId ?? null })));
  if (!tree) return null;
  const cell = (m: api.Match): BracketCell => {
    const side = (who: 'a' | 'b'): BracketSide => {
      const p = m[who];
      return {
        names: p.name ? [p.name] : [], win: !!p.id && m.winnerEntryId === p.id, me: !!me && p.name === me,
        sets: m.status === 'WALKOVER' ? (m.winnerEntryId === p.id ? 'W/O' : null) : (m.sets ?? []).map((x) => String(who === 'a' ? x.a : x.b)),
      };
    };
    return { a: side('a'), b: side('b'), match: m, meta: [whenOf(m), m.court ? courtText(m.court) : ''].filter(Boolean).join(' · ') || undefined };
  };
  const inTree = new Set(tree.cols.flat().map((m) => m?.id));
  const extra = matches.filter((m) => m.stage === 'KO' && !inTree.has(m.id)).map((m) => ({ title: tr('מקומות 3-4'), cell: cell(m) }));
  return <BracketGrid cols={tree.cols.map((col) => col.map((m) => (m ? cell(m) : null)))} extra={extra} onPress={onPress} />;
}

/** A played or scheduled knockout match of a doubles category, to put its sets in Loglig's tree. */
export interface DoublesKo { a: string[]; b: string[]; sets: { a: number; b: number }[]; status: string; winner: 'a' | 'b' | null; meta?: string }
const key = (names: string[]) => names.join(' / ').toLowerCase().replace(/\s+/g, ' ').trim();
const depthOf = (n: api.BracketTree): number => (n.c.length ? 1 + Math.max(...n.c.map(depthOf)) : 0);

/**
 * The doubles knockout tree, drawn like the singles one (same columns and boxes; the same logic as apps/web/src/components/DoublesBracket.tsx, keep them in sync):
 * every inner node of Loglig's tree is a match between what its two children hold (a pair on a leaf, the winner of that match above it).
 * The sets come from the matches already imported.
 */
export const DoublesBracket = memo(function DoublesBracket({ tree, results }: { tree: api.BracketTree; results: DoublesKo[] }) {
  const depth = depthOf(tree);
  if (!depth) return null;
  const used = new Set<DoublesKo>();
  const cols: (BracketCell | null)[][] = Array.from({ length: depth }, (_, d) => Array<BracketCell | null>(2 ** d).fill(null)); // cols[0] = the final
  const done = (r?: DoublesKo) => !!r && r.status !== 'SCHEDULED' && r.status !== 'VOID';
  const put = (n: api.BracketTree, d: number, i: number) => {
    if (!n.c.length) return;
    const [x, y] = n.c as [api.BracketTree, api.BracketTree | undefined];
    const an = x.n, bn = y?.n ?? '';
    const found = an && bn ? results.find((r) => (key(r.a) === key([an]) && key(r.b) === key([bn])) || (key(r.a) === key([bn]) && key(r.b) === key([an]))) : undefined;
    const flipped = !!found && key(found.a) !== key([an]);
    const mk = (name: string, mine: 'a' | 'b'): BracketSide => {
      const m = found && (flipped ? (mine === 'a' ? 'b' : 'a') : mine);
      return {
        names: name ? name.split(' / ') : [],
        win: !!name && (n.n === name || (!!found && done(found) && found.winner === m)),
        sets: !found || !done(found) ? null : found.status === 'WALKOVER' && !found.sets.length ? (found.winner === m ? 'W/O' : null) : found.sets.map((s) => String(m === 'a' ? s.a : s.b)),
      };
    };
    if (found) used.add(found);
    cols[d]![i] = { a: mk(an, 'a'), b: mk(bn, 'b'), meta: found?.meta || undefined };
    put(x, d + 1, 2 * i);
    if (y) put(y, d + 1, 2 * i + 1);
  };
  put(tree, 0, 0);
  // places 3-4: a knockout match that is not in the tree (or, once Loglig flags it, the empty box waiting for the semifinal losers)
  const semis = depth >= 2 ? tree.c.flatMap((x) => x.c.map((y) => y.n)).filter(Boolean) : [];
  const third = results.find((r) => !used.has(r) && semis.length > 0 && [key(r.a), key(r.b)].every((k) => semis.some((sm) => key([sm]) === k)));
  const extra: { title: string; cell: BracketCell }[] = [];
  if (third || (tree.t && depth >= 2)) {
    const sd = (names: string[], me: 'a' | 'b'): BracketSide => ({ names, win: done(third) && third!.winner === me, sets: done(third) ? third!.sets.map((s) => String(me === 'a' ? s.a : s.b)) : null });
    extra.push({ title: tr('מקומות 3-4'), cell: { a: sd(third?.a ?? [], 'a'), b: sd(third?.b ?? [], 'b'), meta: third?.meta || undefined } });
  }
  return <BracketGrid cols={cols.reverse()} extra={extra} />;
});

const b = StyleSheet.create({
  tree: { flexDirection: 'row', paddingVertical: 6, gap: GAP },
  col: { width: 168 },
  title: { textAlign: 'center', color: T.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  cell: { justifyContent: 'center' },
  box: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 12, overflow: 'hidden' },
  empty: { height: 58, borderStyle: 'dashed', backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 2, minHeight: 29 },
  rowB: { borderTopWidth: 1, borderColor: T.line },
  me: { backgroundColor: 'rgba(198,237,69,0.32)' },
  name: { color: T.text, fontSize: 12.5 },
  won: { fontWeight: '800' },
  meta: { color: T.muted, fontSize: 10.5, textAlign: 'center', paddingVertical: 3, borderTopWidth: 1, borderColor: T.line, backgroundColor: T.bg },
  sets: { flexDirection: 'row', gap: 4, direction: 'ltr' },
  set: { minWidth: 9, textAlign: 'center', color: T.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  setWon: { color: T.ok, fontWeight: '800' },
  wo: { color: T.ok, fontWeight: '800', fontSize: 11 },
  // the "]" joining two boxes to the next round, and the short line from it into the next box
  pairLine: { position: 'absolute', end: -GAP / 2, width: GAP / 2, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderEndWidth: 1.5, borderColor: T.line2, borderTopEndRadius: 8, borderBottomEndRadius: 8 },
  inLine: { position: 'absolute', start: -GAP / 2, width: GAP / 2, top: '50%', borderTopWidth: 1.5, borderColor: T.line2 },
});
