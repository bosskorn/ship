import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';
import { haptics } from '../haptics';

/** Filter chip (single choice in a row): tonal when selected, outlined otherwise. */
export function TChip({ label, selected, icon, onPress, testID }: { label: string; selected?: boolean; icon?: IconName; onPress: () => void; testID?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: spacing.sm,
        borderRadius: 8,
        borderWidth: selected ? 0 : StyleSheet.hairlineWidth * 2,
        borderColor: colors.border,
        backgroundColor: selected ? colors.brandLight : pressed ? colors.bgPressed : colors.bgContainer,
      })}
    >
      {icon ? <TIcon name={icon} size="sm" color={selected ? colors.brand : colors.textSecondary} /> : null}
      <TText variant="body" weight={selected ? '600' : '400'} color={selected ? 'brand' : 'textSecondary'}>
        {label}
      </TText>
    </Pressable>
  );
}

/** Horizontally scrolling chip row (never wraps, so long translations stay on one line). */
export function TChipRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    // Fixed height: a horizontal scroller must not collapse or stretch inside a column.
    <View style={{ height: 50 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md, alignItems: 'center' }}>
        {children}
      </ScrollView>
    </View>
  );
}
