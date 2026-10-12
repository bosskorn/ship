/**
 * Launch brand animation (spec §12–13).
 *
 *   0–400ms     Native splash (expo-splash-screen): brand background + house
 *               mark (assets/splash-icon.png), pixel-aligned with frame 0 here.
 *   400–1200ms  This component: the wrench "door" assembles into the house →
 *               logo complete → wordmark → crossfade into Home.
 *
 * Home is already mounted underneath, so the hand-off is a crossfade rather
 * than a blank screen. No spinner, no progress bar, no "Loading" text.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { color, motion } from '@/theme/tokens';

import { NongChangWordmark, SYMBOL, ToolMark } from './Logo';

const ease = Easing.bezier(0.2, 0, 0, 1);
/** Must match `imageWidth` of expo-splash-screen in app.json. */
export const SPLASH_SYMBOL_SIZE = 120;

export function BrandAnimation({ onDone }: { onDone: () => void }) {
  const tool = useSharedValue(0);
  const word = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    tool.value = withTiming(1, { duration: 260, easing: ease });
    word.value = withDelay(220, withTiming(1, { duration: 200, easing: ease }));
    exit.value = withDelay(
      motion.brandAnimation - motion.crossfade,
      withTiming(0, { duration: motion.crossfade }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, [tool, word, exit, onDone]);

  const toolStyle = useAnimatedStyle(() => ({
    opacity: tool.value,
    transform: [{ translateY: (1 - tool.value) * -18 }, { scale: 0.8 + tool.value * 0.2 }],
  }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 8 }] }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="none">
      <View style={styles.symbol}>
        <HouseMark />
        <Animated.View style={[StyleSheet.absoluteFill, toolStyle]}>
          <Svg width={SPLASH_SYMBOL_SIZE} height={SPLASH_SYMBOL_SIZE} viewBox={SYMBOL.viewBox}>
            <ToolMark fill={color.accent} notch={color.brandSplash} />
          </Svg>
        </Animated.View>
      </View>
      <Animated.View style={[styles.word, wordStyle]}>
        <NongChangWordmark size={30} tone="white" />
      </Animated.View>
    </Animated.View>
  );
}

/** Splash frame 0 — identical artwork is exported to assets/splash-icon.png. */
function HouseMark() {
  return (
    <Svg width={SPLASH_SYMBOL_SIZE} height={SPLASH_SYMBOL_SIZE} viewBox={SYMBOL.viewBox}>
      <Rect width={96} height={96} rx={22} fill="rgba(255,255,255,0.12)" />
      <Path d={SYMBOL.roof} stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={SYMBOL.walls} stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.brandSplash, zIndex: 1000, alignItems: 'center', justifyContent: 'center' },
  symbol: { width: SPLASH_SYMBOL_SIZE, height: SPLASH_SYMBOL_SIZE },
  // Positioned below the centred symbol so the symbol stays where the native splash drew it.
  word: { position: 'absolute', top: '50%', marginTop: SPLASH_SYMBOL_SIZE / 2 + 16 },
});
