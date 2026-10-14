import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { TDivider } from '../layout/TDivider';

export interface TTabItem<K extends string> {
  key: K;
  label: string;
}

export function TTabs<K extends string>({
  items,
  value,
  onChange,
  scrollable,
}: {
  items: TTabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  scrollable?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const tabs = items.map((it) => {
    const active = it.key === value;
    return (
      <Pressable
        key={it.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(it.key)}
        style={{
          flex: scrollable ? undefined : 1,
          alignItems: 'center',
          justifyContent: 'center',
          height: 44,
          paddingHorizontal: spacing.md,
        }}
      >
        <TText variant="body" weight={active ? '600' : '400'} color={active ? 'brand' : 'textSecondary'}>
          {it.label}
        </TText>
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            height: 3,
            width: 16,
            borderRadius: 2,
            backgroundColor: active ? colors.brand : 'transparent',
          }}
        />
      </Pressable>
    );
  });
  return (
    <View style={{ backgroundColor: colors.bgContainer }} accessibilityRole="tablist">
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {tabs}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row' }}>{tabs}</View>
      )}
      <TDivider />
    </View>
  );
}
