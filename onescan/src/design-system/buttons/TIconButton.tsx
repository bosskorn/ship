import React from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { IconName, TIcon } from '../icons/TIcon';

export interface TIconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  testID?: string;
}

/** 40×40 hit target with a 24px glyph; no background unless pressed. */
export function TIconButton({ icon, accessibilityLabel, onPress, color, size = 40, disabled, testID }: TIconButtonProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.bgPressed : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <TIcon name={icon} color={color} />
    </Pressable>
  );
}
