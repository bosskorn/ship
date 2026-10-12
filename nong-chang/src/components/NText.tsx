import React from 'react';
import { Text, TextProps } from 'react-native';

import { color as colors, ColorToken, typography, TypographyToken } from '@/theme/tokens';

export interface NTextProps extends TextProps {
  variant?: TypographyToken;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
}

export function NText({ variant = 'body', color = 'textPrimary', align, style, ...rest }: NTextProps) {
  return <Text {...rest} style={[typography[variant], { color: colors[color], textAlign: align }, style]} />;
}
