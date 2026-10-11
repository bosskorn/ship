import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';
import { TButton } from '../buttons/TButton';

export function TEmpty({
  icon = 'documents',
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xxl, gap: spacing.xs }}>
      <TIcon name={icon} size={40} color={colors.textDisabled} strokeWidth={1.5} />
      <TText variant="bodyLarge" color="textSecondary" align="center" style={{ marginTop: spacing.xs }}>
        {title}
      </TText>
      {description ? (
        <TText variant="body" color="textPlaceholder" align="center">
          {description}
        </TText>
      ) : null}
      {actionLabel ? <TButton label={actionLabel} size="medium" variant="secondary" onPress={onAction} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}
