import React from 'react';
import { Platform, Text, TextProps } from 'react-native';
import { ColorTokens } from '../tokens/colors';
import { useTheme } from '../theme/ThemeProvider';
import { TypographyVariant } from './typography';

type TextColor = Extract<
  keyof ColorTokens,
  | 'textPrimary'
  | 'textSecondary'
  | 'textPlaceholder'
  | 'textDisabled'
  | 'textAnti'
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'mediaText'
>;

export interface TTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  weight?: '400' | '500' | '600' | '700';
  align?: 'left' | 'center' | 'right';
}

export function TText({
  variant = 'body',
  color = 'textPrimary',
  weight,
  align,
  style,
  ...rest
}: TTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        theme.typeScale[variant],
        Platform.select({
          android: { includeFontPadding: false },
        }),
        { color: theme.colors[color], fontFamily: theme.fontFamily },
        weight && { fontWeight: weight },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
