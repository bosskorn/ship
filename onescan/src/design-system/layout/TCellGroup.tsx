import React, { Children, Fragment, isValidElement } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { TDivider } from './TDivider';

/**
 * Grouped list section: optional title, full-width container, hairline
 * dividers between rows. No cards, no shadows.
 */
export function TCellGroup({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ marginTop: spacing.md }}>
      {title ? (
        <TText
          variant="bodySmall"
          color="textSecondary"
          style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}
        >
          {title}
        </TText>
      ) : null}
      <View style={{ backgroundColor: colors.bgContainer }}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <TDivider inset={spacing.md} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <TText variant="bodySmall" color="textPlaceholder" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
          {footer}
        </TText>
      ) : null}
    </View>
  );
}
