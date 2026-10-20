import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { locale, tr } from './i18n';
import { T } from './theme';

type Side = 'a' | 'b';
type SetScore = { a: number; b: number; superTb?: boolean };

/** "St 2.10.2026 10:00": a match time as the cards show it. */
export function matchWhen(d: string | Date | null | undefined, kind?: string | null) {
  if (!d) return undefined;
  const x = new Date(d);
  return `${kind ? `${kind} ` : ''}${x.toLocaleDateString(locale())} ${x.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * The app's one match card, the same as the website's: a row per side (a pair on two lines in doubles), a column per set, the winner
 * bold with a green check; the footer holds the status (live, walkover, retired), competition and category, and the time.
 */
export const MatchCard = memo(MatchCardImpl);
function MatchCardImpl({ a, b, sets, status, winner, live, caption, when, mine, onPress }: {
  a: string | string[]; b: string | string[]; sets: SetScore[]; status: string; winner: Side | null | undefined;
  live?: boolean; caption?: string; when?: string; mine?: Side; onPress?: () => void;
}) {
  const done = status !== 'SCHEDULED' && status !== 'VOID';
  const row = (side: Side, name: string | string[]) => {
    const won = done && winner === side;
    const lost = done && !!winner && !won;
    const names = Array.isArray(name) ? name : [name];
    return (
      <View style={[c.row, side === 'b' && c.line]}>
        <Text style={c.tick} accessibilityLabel={won ? tr('ניצח') : undefined}>{won ? '✓' : ''}</Text>
        <View style={{ flex: 1 }}>
          {names.map((n, i) => <Text key={i} numberOfLines={1} style={[c.name, won && c.nameWon, lost && mine !== side && c.nameLost]}>{n}</Text>)}
        </View>
        <View style={c.sets}>
          {sets.map((x, i) => {
            const my = side === 'a' ? x.a : x.b, other = side === 'a' ? x.b : x.a;
            return <Text key={i} style={[c.set, my > other && c.setWon]}>{my}</Text>;
          })}
        </View>
      </View>
    );
  };
  const note = status === 'WALKOVER' ? tr('ווק-אובר') : status === 'RETIRED' ? tr('פרישה') : status === 'VOID' ? tr('בוטל') : live ? tr('● חי') : '';
  const body = (
    <>
      {row('a', a)}{row('b', b)}
      {(note || caption || when) && (
        <View style={c.foot}>
          {!!note && <View style={[c.pill, live ? { backgroundColor: T.volt } : { backgroundColor: T.warnbg }]}><Text style={[c.pillT, { color: live ? T.ink : T.warn }]}>{note}</Text></View>}
          {!!caption && <Text style={c.muted} numberOfLines={1}>{caption}</Text>}
          {!!when && <Text style={[c.muted, c.when]}>{when}</Text>}
        </View>
      )}
    </>
  );
  const card = [c.card, mine && c.cardMine];
  return onPress ? <Pressable style={({ pressed }) => [card, pressed && { opacity: 0.85 }]} onPress={onPress}>{body}</Pressable> : <View style={card}>{body}</View>;
}

const c = StyleSheet.create({
  cardMine: { borderColor: T.volt, borderWidth: 2 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  line: { borderTopWidth: 1, borderColor: T.line },
  tick: { width: 18, color: T.ok, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 16, fontWeight: '500', color: T.text },
  nameWon: { fontWeight: '800' },
  nameLost: { color: T.muted },
  sets: { flexDirection: 'row', gap: 4, direction: 'ltr' },
  set: { width: 26, textAlign: 'center', fontSize: 17, color: T.text, fontVariant: ['tabular-nums'] },
  setWon: { fontWeight: '800' },
  foot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillT: { fontSize: 12.5, fontWeight: '700' },
  muted: { color: T.muted, fontSize: 13, flexShrink: 1 },
  when: { marginStart: 'auto', fontVariant: ['tabular-nums'] },
});
