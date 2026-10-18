import { Appearance } from 'react-native';
import { Heebo_400Regular, Heebo_500Medium, Heebo_600SemiBold, Heebo_700Bold, Heebo_800ExtraBold } from '@expo-google-fonts/heebo';
import { Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold, Rubik_800ExtraBold } from '@expo-google-fonts/rubik';
import Svg, { Circle, Path } from 'react-native-svg';
import { isRtl } from './i18n';

/** "Volt Night" palette, mirrored from apps/web globals.css (light + dark). Picked once at launch from the phone's theme. */
const light = {
  ink: '#0A1F44', volt: '#D2FF2E', blue: '#2447F5', blue2: '#4A67FF',
  bg: '#EEF0EA', surface: '#FFFFFF', surface2: '#F5F6F1', line: '#E0E3DA', line2: '#C9CEC3',
  text: '#0E1512', muted: '#59655E', btn: '#13306E', btnText: '#FFFFFF',
  ok: '#0B7A43', okbg: '#DCF3E4', warn: '#8F4E00', warnbg: '#FCEFD3', bad: '#B3261E', badbg: '#FCE6E3',
  glass: 'rgba(255,255,255,0.97)', glassLine: 'rgba(12,18,16,0.08)', dark: false,
};
const dark: typeof light = {
  ...light,
  blue: '#8CA3FF', blue2: '#A9BAFF',
  bg: '#070A09', surface: '#111715', surface2: '#171E1B', line: '#222B27', line2: '#33403A',
  text: '#EDF1EE', muted: '#8E9B94', btn: '#D2FF2E', btnText: '#0C1210',
  okbg: '#0E3220', ok: '#5BD58F', warnbg: '#3A2A0F', warn: '#F5B452', badbg: '#3B1713', bad: '#FF8A7E',
  glass: 'rgba(23,30,27,0.97)', glassLine: 'rgba(255,255,255,0.09)', dark: true,
};

export const FONTS = { Heebo_400Regular, Heebo_500Medium, Heebo_600SemiBold, Heebo_700Bold, Heebo_800ExtraBold, Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold, Rubik_800ExtraBold };

export const T = Appearance.getColorScheme() === 'dark' ? dark : light;

export const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  live: 'M3 5h18v14H3zM12 5v14M3 12h18',
  rank: 'M5 20V10M12 20V4M19 20v-7',
  players: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c.7-3.5 3.5-5 7-5s6.3 1.5 7 5M17 4.2a3.5 3.5 0 010 6.6M18 15c2 .6 3.4 2.2 4 5',
  more: 'M4 7h16M4 12h16M4 17h16',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c.8-4 4-6 8-6s7.2 2 8 6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  back: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  leagues: 'M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8',
  doc: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  club: 'M3 20V9l9-5 9 5v11M3 20h18M9 20v-6h6v6',
  stats: 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5',
} as const;

export function Icon({ name, color, size = 22 }: { name: keyof typeof ICONS; color: string; size?: number }) {
  return (
    // "back" points to where a page came from: right in Hebrew, left in English
    <Svg width={size} height={size} style={name === 'back' && !isRtl() ? { transform: [{ scaleX: -1 }] } : undefined} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={name === 'tick' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name]} />
    </Svg>
  );
}

/** The ITA ball mark, as on the website. */
export function BallMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="14.5" fill="#D7F43B" stroke="#0A1F44" strokeWidth="1.6" />
      <Path d="M5.5 7.5c6.5 4.5 6.5 12.5 0 17M26.5 7.5c-6.5 4.5-6.5 12.5 0 17" fill="none" stroke="#0A1F44" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

/** Court lines for the hero, same geometry idea as the web hero. */
export function CourtLines() {
  return (
    <Svg width={300} height={170} viewBox="0 0 260 140" style={{ position: 'absolute', left: -40, top: -6, opacity: 0.28 }}>
      <Path d="M10 10h240v120H10zM10 28h240M10 112h240M70 28v84M190 28v84M70 70h120" stroke="#fff" strokeWidth="1.2" fill="none" />
      <Path d="M130 4v132" stroke="#D2FF2E" strokeWidth="2.5" />
    </Svg>
  );
}

// Plain <Text> elements (no style colour) should follow the theme, otherwise they stay black on the dark ground. They also get the
// website's fonts: Heebo for text, Rubik from 20px up (the site's display font stack ends in Rubik for Hebrew), picked by weight
// because Android ignores fontWeight for custom fonts.
import { StyleSheet, Text, TextInput } from 'react-native';
import { cloneElement } from 'react';
const weightName = (w: number) => (w >= 800 ? '800ExtraBold' : w >= 700 ? '700Bold' : w >= 600 ? '600SemiBold' : w >= 500 ? '500Medium' : '400Regular');
const patch = (C: any, input = false) => {
  const orig = C.render;
  C.render = function (...a: any[]) {
    const el = orig.apply(this, a);
    const flat = (StyleSheet.flatten(el.props.style) ?? {}) as { fontWeight?: string | number; fontSize?: number; fontFamily?: string };
    const w = flat.fontWeight === 'bold' ? 700 : Number(flat.fontWeight) || 400;
    const family = flat.fontFamily ?? `${!input && (flat.fontSize ?? 14) >= 20 ? 'Rubik' : 'Heebo'}_${weightName(w)}`;
    return cloneElement(el, { style: [{ color: T.text }, el.props.style, { fontFamily: family, fontWeight: 'normal' }] });
  };
};
patch(Text); patch(TextInput, true);
