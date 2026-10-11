import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';

/** Linear determinate progress. `value` is 0..1. */
export function TProgress({ value, label }: { value: number; label?: string }) {
  const { colors, radius, spacing } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ gap: spacing.xxs }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      {label ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <TText variant="bodySmall" color="textSecondary">
            {label}
          </TText>
          <TText variant="bodySmall" color="textSecondary">{`${Math.round(pct * 100)}%`}</TText>
        </View>
      ) : null}
      <View style={{ height: 4, borderRadius: radius.sm, backgroundColor: colors.bgSecondary, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: colors.brand }} />
      </View>
    </View>
  );
}
