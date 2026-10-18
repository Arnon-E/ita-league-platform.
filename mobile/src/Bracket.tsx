import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type * as api from './api';
import { bracketLayout, roundName } from './bracketLayout';
import { tr } from './i18n';
import { T } from './theme';

const CELL = 72; // height of one first-round slot; later rounds take 2, 4, 8... of them, so every box sits between its two feeders
const GAP = 24; // space between rounds, half of it on each side for the connecting lines

/**
 * The knockout draw of one category as a tree, as on the website: a column per round from the first round to the final, each pair
 * of matches joined by a bracket line to the match it leads to, a score per set, the winner in bold. The viewer's own player (me)
 * is marked. Scrolls sideways; follows the language's direction.
 */
export function Bracket({ matches, me, onPress }: { matches: api.Match[]; me?: string; onPress?: (m: api.Match) => void }) {
  const tree = bracketLayout(matches.map((m, i) => ({ ...m, index: m.index ?? i, aEntryId: m.a.id, bEntryId: m.b.id, winnerEntryId: m.winnerEntryId ?? null })));
  if (!tree) return null;
  const { cols } = tree;
  const height = cols[0]!.length * CELL;
  const side = (m: api.Match, who: 'a' | 'b') => {
    const p = m[who];
    const won = !!p.id && m.winnerEntryId === p.id;
    const mine = !!me && p.name === me;
    return (
      <View style={[b.row, who === 'b' && b.rowB, mine && b.me]}>
        <Text style={[b.name, won && b.won]} numberOfLines={1}>{p.name ?? tr('טרם נקבע')}</Text>
        <View style={b.sets}>
          {m.status === 'WALKOVER'
            ? (won ? <Text style={b.wo}>W/O</Text> : null)
            : (m.sets ?? []).map((x, i) => <Text key={i} style={[b.set, won && b.setWon]}>{who === 'a' ? x.a : x.b}</Text>)}
        </View>
      </View>
    );
  };
  const box = (m: api.Match | null, k: number, key: number) => (
    <View key={key} style={[b.cell, { height: CELL * 2 ** k }]}>
      {k > 0 && <View style={b.inLine} />}
      {m
        ? <Pressable style={({ pressed }) => [b.box, pressed && { opacity: 0.8 }]} disabled={!onPress} onPress={() => onPress?.(m)}>{side(m, 'a')}{side(m, 'b')}</Pressable>
        : <View style={[b.box, b.empty, k === 0 && { opacity: 0 }]} />}
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={b.tree}>
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
    </ScrollView>
  );
}

const b = StyleSheet.create({
  tree: { paddingVertical: 6, paddingHorizontal: 2, gap: GAP },
  col: { width: 168 },
  title: { textAlign: 'center', color: T.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  cell: { justifyContent: 'center' },
  box: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 12, overflow: 'hidden' },
  empty: { height: 58, borderStyle: 'dashed', backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 29 },
  rowB: { borderTopWidth: 1, borderColor: T.line },
  me: { backgroundColor: 'rgba(198,237,69,0.32)' },
  name: { flex: 1, color: T.text, fontSize: 12.5 },
  won: { fontWeight: '800' },
  sets: { flexDirection: 'row', gap: 4, direction: 'ltr' },
  set: { minWidth: 9, textAlign: 'center', color: T.muted, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  setWon: { color: T.ok, fontWeight: '800' },
  wo: { color: T.ok, fontWeight: '800', fontSize: 11 },
  // the "]" joining two boxes to the next round, and the short line from it into the next box
  pairLine: { position: 'absolute', end: -GAP / 2, width: GAP / 2, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderEndWidth: 1.5, borderColor: T.line2, borderTopEndRadius: 8, borderBottomEndRadius: 8 },
  inLine: { position: 'absolute', start: -GAP / 2, width: GAP / 2, top: '50%', borderTopWidth: 1.5, borderColor: T.line2 },
});
