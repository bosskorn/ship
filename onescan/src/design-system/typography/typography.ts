import { Platform, TextStyle } from 'react-native';

/**
 * Hierarchy comes from size + weight + spacing, not color or borders.
 * Line heights are generous so Thai stacked vowels/tones do not clip.
 */
export type TypographyVariant =
  | 'display'
  | 'headline'
  | 'titleLarge'
  | 'title'
  | 'bodyLarge'
  | 'body'
  | 'bodySmall'
  | 'caption';

export const typeScale: Record<TypographyVariant, TextStyle> = {
  display: { fontSize: 36, lineHeight: 48, fontWeight: '600' },
  headline: { fontSize: 28, lineHeight: 40, fontWeight: '600' },
  titleLarge: { fontSize: 20, lineHeight: 30, fontWeight: '600' },
  title: { fontSize: 16, lineHeight: 26, fontWeight: '600' },
  bodyLarge: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  body: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  bodySmall: { fontSize: 12, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 10, lineHeight: 16, fontWeight: '400' },
};

/**
 * Font family per script. `undefined` = platform system font, which already
 * covers Thai and CJK. Bundled fonts (Inter, Noto Sans Thai) can be plugged
 * in here without touching components.
 */
export type ScriptFamily = 'latin' | 'thai' | 'cjk';

export const fontFamilies: Record<ScriptFamily, string | undefined> = {
  latin: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "SamsungOne", "MiSans", "OPPOSans", sans-serif',
    default: 'sans-serif',
  }),
  thai: Platform.select({
    ios: 'Sukhumvit Set, Thonburi, System',
    android: 'sans-serif',
    web: '"Noto Sans Thai", "Sukhumvit Set", "Thonburi", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SamsungOne", "MiSans", "OPPOSans", sans-serif',
    default: 'sans-serif',
  }),
  cjk: Platform.select({
    ios: 'PingFang SC, Hiragino Sans GB, System',
    android: 'sans-serif',
    web: '"Noto Sans CJK SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
    default: 'sans-serif',
  }),
};

export function scriptForLanguage(lang: string): ScriptFamily {
  const base = lang.split('-')[0];
  if (base === 'th') return 'thai';
  if (base === 'zh' || base === 'ja' || base === 'ko') return 'cjk';
  return 'latin';
}
