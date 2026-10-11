import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { TIconButton } from '../buttons/TIconButton';

export interface TNavigationBarProps {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Large left-aligned title for top-level tab pages. */
  large?: boolean;
  right?: React.ReactNode;
  left?: React.ReactNode;
  transparent?: boolean;
  divider?: boolean;
}

export function TNavigationBar({ title, onBack, backLabel = 'Back', large, right, left, transparent, divider }: TNavigationBarProps) {
  const { colors, spacing, layout } = useTheme();
  const bg = transparent ? 'transparent' : colors.bgContainer;

  if (large) {
    return (
      <View
        style={{
          backgroundColor: bg,
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.md,
          paddingRight: spacing.xs,
        }}
      >
        <TText variant="titleLarge" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={1}>
          {title}
        </TText>
        <View style={styles.actions}>{right}</View>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: bg,
        height: layout.navBarHeight,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xxs,
        borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={[styles.side, { justifyContent: 'flex-start' }]}>
        {left ?? (onBack ? <TIconButton icon="back" accessibilityLabel={backLabel} onPress={onBack} /> : null)}
      </View>
      <TText variant="title" align="center" style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
        {title}
      </TText>
      <View style={[styles.side, { justifyContent: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  side: { minWidth: 88, flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
