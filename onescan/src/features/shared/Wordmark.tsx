import React from 'react';
import { TText } from '@/design-system';

/** OneScan wordmark (text only until the brand mark is approved). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <TText variant="titleLarge" weight="700" accessibilityRole="header" style={{ fontSize: size, lineHeight: size * 1.3, letterSpacing: -0.4 }}>
      One
      <TText variant="titleLarge" weight="700" color="brand" style={{ fontSize: size, lineHeight: size * 1.3, letterSpacing: -0.4 }}>
        Scan
      </TText>
    </TText>
  );
}
