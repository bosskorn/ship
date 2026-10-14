import React from 'react';
import { TText } from '@/design-system';

/** The brand name, never translated; drawn in two tones ("One" + brand-coloured "Scan"). */
const BRAND = ['One', 'Scan'] as const;

/** OneScan wordmark (text only until the brand mark is approved). */
export function Wordmark({ size = 22 }: { size?: number }) {
  const type = { fontSize: size, lineHeight: size * 1.3, letterSpacing: -0.4 };
  return (
    <TText variant="titleLarge" weight="700" accessibilityRole="header" accessibilityLabel={BRAND.join('')} style={type}>
      {BRAND[0]}
      <TText variant="titleLarge" weight="700" color="brand" style={type}>
        {BRAND[1]}
      </TText>
    </TText>
  );
}
