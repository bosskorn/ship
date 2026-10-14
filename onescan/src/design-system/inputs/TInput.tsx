import React from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';

export interface TInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
}

export function TInput({ label, error, ...rest }: TInputProps) {
  const { colors, radius, spacing, typeScale, fontFamily } = useTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      {label ? (
        <TText variant="bodySmall" color="textSecondary">
          {label}
        </TText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textPlaceholder}
        {...rest}
        style={[
          typeScale.bodyLarge,
          {
            fontFamily,
            color: colors.textPrimary,
            height: 48,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? colors.error : colors.border,
            backgroundColor: colors.bgContainer,
          },
        ]}
      />
      {error ? (
        <TText variant="bodySmall" color="error">
          {error}
        </TText>
      ) : null}
    </View>
  );
}
