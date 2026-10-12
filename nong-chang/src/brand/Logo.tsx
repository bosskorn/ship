/**
 * น้องช่าง brand marks (spec §5).
 *
 * Symbol = abstract Home (roof + walls) whose door is an upright open-end
 * wrench. Geometric, single-weight strokes, reads at app-icon size.
 * This is the reference direction — production vectors live in /brand.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { NText } from '@/components/NText';
import { color } from '@/theme/tokens';

export type LogoTone = 'brand' | 'white' | 'dark';

export const SYMBOL = {
  viewBox: '0 0 96 96',
  roof: 'M20 46 L48 22 L76 46',
  walls: 'M28 42 V74 H68 V42',
  roofLength: 74,
  wallsLength: 104,
} as const;

const tones = (tone: LogoTone) => {
  switch (tone) {
    case 'white':
      return { bg: 'transparent', stroke: '#FFFFFF', tool: '#FFFFFF', notch: color.primary };
    case 'dark':
      return { bg: 'transparent', stroke: color.textPrimary, tool: color.textPrimary, notch: '#FFFFFF' };
    default:
      return { bg: color.primary, stroke: '#FFFFFF', tool: color.accent, notch: color.primary };
  }
};

/** The wrench "door": head circle with a notch, plus stem. */
export function ToolMark({ fill, notch }: { fill: string; notch: string }) {
  return (
    <>
      <Rect x={44} y={56} width={8} height={18} fill={fill} />
      <Circle cx={48} cy={55} r={9} fill={fill} />
      <Rect x={44.5} y={44} width={7} height={10} rx={1.5} fill={notch} />
    </>
  );
}

export function NongChangSymbol({ size = 64, tone = 'brand', background = true }: { size?: number; tone?: LogoTone; background?: boolean }) {
  const c = tones(tone);
  const notch = background || tone !== 'brand' ? c.notch : '#FFFFFF';
  return (
    <Svg width={size} height={size} viewBox={SYMBOL.viewBox} accessibilityLabel="น้องช่าง">
      {background && tone === 'brand' ? <Rect width={96} height={96} rx={22} fill={c.bg} /> : null}
      <Path d={SYMBOL.roof} stroke={background || tone !== 'brand' ? c.stroke : color.primary} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={SYMBOL.walls} stroke={background || tone !== 'brand' ? c.stroke : color.primary} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ToolMark fill={c.tool} notch={notch} />
    </Svg>
  );
}

/** Wordmark is live text so Thai renders with the platform's Thai face. */
export function NongChangWordmark({ size = 28, tone = 'brand' }: { size?: number; tone?: LogoTone }) {
  return (
    <NText
      style={{
        fontSize: size,
        lineHeight: size * 1.45,
        fontWeight: '600',
        letterSpacing: 0.2,
        color: tone === 'white' ? '#FFFFFF' : tone === 'dark' ? color.textPrimary : color.primary,
      }}
    >
      น้องช่าง
    </NText>
  );
}

export function NongChangLogo({ layout = 'horizontal', size = 40, tone = 'brand' }: { layout?: 'horizontal' | 'stacked'; size?: number; tone?: LogoTone }) {
  return (
    <View style={layout === 'horizontal' ? styles.h : styles.v} accessibilityRole="image" accessibilityLabel="น้องช่าง">
      <NongChangSymbol size={size} tone={tone} />
      <NongChangWordmark size={layout === 'horizontal' ? size * 0.6 : size * 0.42} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  v: { alignItems: 'center', gap: 12 },
});
