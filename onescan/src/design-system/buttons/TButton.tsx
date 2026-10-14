import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

export type TButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
export type TButtonSize = 'large' | 'medium' | 'small';

export interface TButtonProps {
  label: string;
  onPress?: () => void;
  variant?: TButtonVariant;
  size?: TButtonSize;
  icon?: IconName;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const heights: Record<TButtonSize, number> = { large: 48, medium: 40, small: 32 };

export function TButton({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  icon,
  block,
  loading,
  disabled,
  style,
  testID,
}: TButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.brand, pressed: colors.brandActive, fg: colors.textAnti, border: undefined },
    secondary: { bg: colors.brandLight, pressed: colors.bgPressed, fg: colors.brand, border: undefined },
    outline: { bg: colors.bgContainer, pressed: colors.bgPressed, fg: colors.textPrimary, border: colors.border },
    text: { bg: 'transparent', pressed: colors.bgPressed, fg: colors.brand, border: undefined },
    danger: { bg: colors.error, pressed: colors.error, fg: colors.textAnti, border: undefined },
  }[variant];

  const fg = inactive && variant !== 'primary' ? colors.textDisabled : palette.fg;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'small' ? spacing.sm : spacing.md,
          borderRadius: radius.md,
          backgroundColor:
            inactive && variant === 'primary' ? colors.brandDisabled : pressed ? palette.pressed : palette.bg,
          borderColor: palette.border ?? 'transparent',
          borderWidth: palette.border ? StyleSheet.hairlineWidth : 0,
          alignSelf: block ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <TIcon name={icon} size={size === 'small' ? 'sm' : 'md'} color={fg} />
        ) : null}
        <TText
          variant={size === 'small' ? 'bodySmall' : 'bodyLarge'}
          weight="600"
          style={{ color: fg }}
          numberOfLines={1}
        >
          {label}
        </TText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
