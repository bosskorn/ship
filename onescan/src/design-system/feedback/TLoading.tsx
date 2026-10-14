import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';

export function TLoading({ label, inverse }: { label?: string; inverse?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md }}>
      <ActivityIndicator color={inverse ? colors.mediaText : colors.brand} />
      {label ? (
        <TText variant="body" color={inverse ? 'mediaText' : 'textSecondary'}>
          {label}
        </TText>
      ) : null}
    </View>
  );
}
