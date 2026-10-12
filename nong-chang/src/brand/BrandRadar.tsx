/**
 * Radar signature graphic — the "real-time" brand moment used by the
 * Instant Service block and Matching. Brand gradient is allowed here (§23).
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { color } from '@/theme/tokens';

/** Technician blips as (angle°, radius 0..1). */
const BLIPS: [number, number][] = [
  [35, 0.62],
  [140, 0.4],
  [215, 0.78],
  [300, 0.55],
];

export function BrandRadar({ size = 72, onDark = false }: { size?: number; onDark?: boolean }) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [sweep]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }));

  const ring = onDark ? 'rgba(255,255,255,0.28)' : color.primaryLightBorder;
  const blip = onDark ? '#FFFFFF' : color.primary;
  const r = 50;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        {!onDark ? <Circle cx={50} cy={50} r={50} fill={color.graphicTint} /> : <Circle cx={50} cy={50} r={50} fill="rgba(255,255,255,0.10)" />}
        <Circle cx={50} cy={50} r={34} stroke={ring} strokeWidth={1.5} fill="none" />
        <Circle cx={50} cy={50} r={18} stroke={ring} strokeWidth={1.5} fill="none" />
        {BLIPS.map(([a, d]) => {
          const rad = (a * Math.PI) / 180;
          return <Circle key={a} cx={50 + Math.cos(rad) * r * d * 0.85} cy={50 + Math.sin(rad) * r * d * 0.85} r={3.2} fill={blip} />;
        })}
      </Svg>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, sweepStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="sweep" x1="50" y1="0" x2="100" y2="50" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={onDark ? '#FFFFFF' : color.brandGradientTo} stopOpacity={0.55} />
              <Stop offset="1" stopColor={onDark ? '#FFFFFF' : color.brandGradientFrom} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d="M50 50 L50 2 A48 48 0 0 1 98 50 Z" fill="url(#sweep)" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx={50} cy={50} r={9} fill={onDark ? '#FFFFFF' : color.primary} />
        <Path d="M45.5 51 L50 46.8 L54.5 51 V54.5 H45.5 Z" fill={onDark ? color.primary : '#FFFFFF'} />
      </Svg>
    </View>
  );
}
