import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

export type TTagTheme = 'default' | 'brand' | 'success' | 'warning' | 'error';

export function TTag({ label, theme = 'default', icon }: { label: string; theme?: TTagTheme; icon?: IconName }) {
  const { colors, radius, spacing } = useTheme();
  const map = {
    default: [colors.bgSecondary, colors.textSecondary],
    brand: [colors.brandLight, colors.brand],
    success: [colors.successLight, colors.success],
    warning: [colors.warningLight, colors.warning],
    error: [colors.errorLight, colors.error],
  } as const;
  const [bg, fg] = map[theme];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        height: 24,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.sm,
        backgroundColor: bg,
      }}
    >
      {icon ? <TIcon name={icon} size={14} color={fg} /> : null}
      <TText variant="bodySmall" style={{ color: fg }}>
        {label}
      </TText>
    </View>
  );
}
