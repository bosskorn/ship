import type { BottomTabBarProps } from 'expo-router/tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  badge?: number;
}

/** Four-item bottom navigation (spec §15). No hamburger, no sidebar. */
export function NBottomNavigation({ state, navigation, items }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const item = items.find((i) => i.name === route.name);
        if (!item) return null;
        const focused = state.index === index;
        const tint = focused ? color.primary : color.textSecondary;
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
            <View>
              <NIcon name={item.icon} size={24} color={tint} strokeWidth={focused ? 2 : 1.75} />
              {item.badge ? (
                <View style={styles.badge}>
                  <NBadge count={item.badge} />
                </View>
              ) : null}
            </View>
            <NText variant="caption" style={{ color: tint, fontWeight: focused ? '500' : '400' }}>
              {item.label}
            </NText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bgContainer,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  item: { flex: 1, height: layout.bottomBarHeight, alignItems: 'center', justifyContent: 'center', gap: 2 },
  badge: { position: 'absolute', top: -4, right: -10 },
});
