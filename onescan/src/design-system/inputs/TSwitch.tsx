import React from 'react';
import { Platform, Switch } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface TSwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function TSwitch({ value, onValueChange, disabled, accessibilityLabel, testID }: TSwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.border, true: colors.brand }}
      thumbColor={Platform.OS === 'android' ? colors.bgContainer : undefined}
      ios_backgroundColor={colors.border}
    />
  );
}
