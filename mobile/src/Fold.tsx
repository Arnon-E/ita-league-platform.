import { Pressable, Text, View } from 'react-native';
import { T } from './theme';

/** A section title that folds its content: the whole row is the button, with a chevron drawn from borders (the same on every Android font). */
export function FoldHeader({ title, open, onPress, style }: { title: string; open: boolean; onPress: () => void; style?: object }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.4, flexShrink: 1 }}>{title}</Text>
      <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: T.line2, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 8, height: 8, borderRightWidth: 2, borderBottomWidth: 2, borderColor: T.text, transform: [{ translateY: open ? 2 : -2 }, { rotate: open ? '-135deg' : '45deg' }] }} />
      </View>
    </Pressable>
  );
}
