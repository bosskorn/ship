import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';

export function TBadge({ count, dot, max = 99 }: { count?: number; dot?: boolean; max?: number }) {
  const { colors, radius } = useTheme();
  if (dot) return <View style={{ width: 8, height: 8, borderRadius: radius.round, backgroundColor: colors.error }} />;
  if (!count) return null;
  return (
    <View
      style={{
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: radius.round,
        backgroundColor: colors.error,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TText variant="caption" color="textAnti" weight="600">
        {count > max ? `${max}+` : String(count)}
      </TText>
    </View>
  );
}
