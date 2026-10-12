import type { BottomTabBarProps } from 'expo-router/tabs';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { color, layout } from '@/theme/tokens';

import { NBadge } from './NDisplay';
import { IconName, NIcon } from './NIcon';
import { NText } from './NText';

export interface NavItem {
  name: string;
  label: string;
  icon: IconName;
  /** Filled variant shown when selected. */
  activeIcon: IconName;
  badge?: number;
}

/**
 * Four-item bottom navigation (spec §15, directive V2 §20).
 * Selected = filled icon + brand colour + medium label, with a small native
 * spring on change. Unselected = outline icon in neutral grey.
 */
export function NBottomNavigation({ state, navigation, items }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const item = items.find((i) => i.name === route.name);
        if (!item) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            style={styles.item}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                haptic.select();
                navigation.navigate(route.name, route.params);
              }
            }}
          >
            <TabIcon item={item} focused={focused} />
            <NText variant="label" style={{ color: focused ? color.primary : color.textSecondary, fontWeight: focused ? '600' : '400' }}>
              {item.label}
            </NText>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ item, focused }: { item: NavItem; focused: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused) {
      scale.value = 0.82;
      scale.value = withSpring(1, { damping: 12, stiffness: 320 });
    }
  }, [focused, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <NIcon name={focused ? item.activeIcon : item.icon} size={24} color={focused ? color.primary : color.textSecondary} />
      {item.badge ? (
        <View style={styles.badge}>
          <NBadge count={item.badge} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bgContainer,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  item: { flex: 1, height: layout.bottomBarHeight + 4, alignItems: 'center', justifyContent: 'center', gap: 3 },
  badge: { position: 'absolute', top: -4, right: -12 },
});
