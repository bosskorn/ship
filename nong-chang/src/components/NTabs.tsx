import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { color, layout, space } from '@/theme/tokens';

import { NBadge } from './NDisplay';
import { NText } from './NText';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

export function NTabs<T extends string>({ items, value, onChange, scrollable }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; scrollable?: boolean }) {
  const tabs = items.map((item) => {
    const active = item.value === value;
    return (
      <Pressable
        key={item.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (!active) haptic.select();
          onChange(item.value);
        }}
        style={[styles.tab, !scrollable && styles.tabFlex]}
      >
        <View style={styles.labelRow}>
          <NText variant={active ? 'bodyStrong' : 'body'} color={active ? 'primary' : 'textSecondary'} numberOfLines={1}>
            {item.label}
          </NText>
          {item.badge ? <NBadge count={item.badge} /> : null}
        </View>
        <View style={[styles.indicator, active && styles.indicatorActive]} />
      </Pressable>
    );
  });
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenPadding - space.xs }}>
          {tabs}
        </ScrollView>
      ) : (
        tabs
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bgContainer,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  tab: { height: 48, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'flex-end' },
  tabFlex: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flex: 1 },
  indicator: { height: 2, width: 24, borderRadius: 1, backgroundColor: 'transparent' },
  indicatorActive: { backgroundColor: color.primary },
});
