import React from 'react';
import { Pressable, PressableProps, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with native-feeling scale feedback (directive V2 §26: "กด Service:
 * icon response"). Shrinks within one frame on touch-down, springs back on release.
 */
export function NPressable({
  children,
  style,
  scaleTo = 0.94,
  haptics = true,
  onPress,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: ViewStyle | ViewStyle[]; scaleTo?: number; haptics?: boolean }) {
  const s = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        s.set(withTiming(scaleTo, { duration: 80 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, { damping: 14, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.select();
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
