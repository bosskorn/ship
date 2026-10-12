import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { color, radius, space, typography } from '@/theme/tokens';

import { IconName, NIcon } from './NIcon';
import { NText } from './NText';

export type ButtonTheme = 'primary' | 'default' | 'outline' | 'text' | 'danger';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface NButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  theme?: ButtonTheme;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: ViewStyle;
  haptics?: boolean;
  accessibilityLabel?: string;
}

const HEIGHT: Record<ButtonSize, number> = { large: 48, medium: 40, small: 32 };

const palette = (theme: ButtonTheme, pressed: boolean, disabled: boolean) => {
  if (disabled) {
    return theme === 'text'
      ? { bg: 'transparent', fg: color.textDisabled, border: 'transparent' }
      : { bg: color.bgDisabled, fg: color.textDisabled, border: color.bgDisabled };
  }
  switch (theme) {
    case 'primary':
      return { bg: pressed ? color.primaryPressed : color.primary, fg: color.textOnPrimary, border: 'transparent' };
    case 'danger':
      return { bg: pressed ? color.errorLight : color.bgContainer, fg: color.error, border: color.error };
    case 'outline':
      return { bg: pressed ? color.primaryLight : color.bgContainer, fg: color.primary, border: color.primary };
    case 'text':
      return { bg: pressed ? color.bgSecondary : 'transparent', fg: color.primary, border: 'transparent' };
    default:
      return { bg: pressed ? color.bgSecondary : color.bgContainer, fg: color.textPrimary, border: color.border };
  }
};

export function NButton({
  children,
  onPress,
  theme = 'default',
  size = 'large',
  block,
  disabled,
  loading,
  icon,
  style,
  haptics,
  accessibilityLabel,
}: NButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptics) haptic.select();
        onPress?.();
      }}
      // Pressed state renders synchronously on touch-down: <100ms visual feedback.
      style={({ pressed }) => {
        const c = palette(theme, pressed, !!disabled);
        return [
          styles.base,
          {
            height: HEIGHT[size],
            paddingHorizontal: size === 'small' ? space.sm : space.md,
            backgroundColor: c.bg,
            borderColor: c.border,
            alignSelf: block ? 'stretch' : 'auto',
            flexGrow: block ? 1 : 0,
          },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const c = palette(theme, pressed, !!disabled);
        const text = size === 'small' ? typography.secondaryStrong : typography.bodyStrong;
        return (
          <View style={styles.row}>
            {loading ? <ActivityIndicator size="small" color={c.fg} /> : icon ? <NIcon name={icon} size={size === 'small' ? 16 : 20} color={c.fg} /> : null}
            {typeof children === 'string' ? (
              <NText style={[text, { color: c.fg }]} numberOfLines={1}>
                {children}
              </NText>
            ) : (
              children
            )}
          </View>
        );
      }}
    </Pressable>
  );
}

export function NIconButton({
  icon,
  onPress,
  size = 40,
  iconColor = color.textPrimary,
  accessibilityLabel,
  bordered,
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  iconColor?: string;
  accessibilityLabel: string;
  bordered?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.icon,
        { width: size, height: size, backgroundColor: pressed ? color.bgSecondary : bordered ? color.bgContainer : 'transparent' },
        bordered && { borderWidth: 1, borderColor: color.border },
      ]}
    >
      <NIcon name={icon} size={22} color={iconColor} />
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  icon: { borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6 },
});
