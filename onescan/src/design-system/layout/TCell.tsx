import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

export interface TCellProps {
  title: string;
  description?: string;
  /** Right-aligned secondary value (e.g. current setting). */
  note?: string;
  icon?: IconName;
  iconColor?: string;
  /** Custom left element (e.g. thumbnail); takes priority over `icon`. */
  left?: React.ReactNode;
  right?: React.ReactNode;
  arrow?: boolean;
  danger?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** Selected option in a single-choice list (announced by screen readers). */
  selected?: boolean;
  testID?: string;
}

export function TCell({
  title, description, note, icon, iconColor, left, right, arrow, danger, onPress, onLongPress, disabled, selected, testID,
}: TCellProps) {
  const { colors, spacing, layout } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      disabled={disabled || (!onPress && !onLongPress)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: layout.cellMinHeight,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
          backgroundColor: pressed ? colors.bgPressed : colors.bgContainer,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {left ?? (icon ? <TIcon name={icon} size="md" color={danger ? colors.error : iconColor ?? colors.textPrimary} /> : null)}
      <View style={styles.body}>
        <TText variant="bodyLarge" numberOfLines={2} style={danger ? { color: colors.error } : undefined}>
          {title}
        </TText>
        {description ? (
          <TText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {description}
          </TText>
        ) : null}
      </View>
      {note ? (
        <TText variant="body" color="textPlaceholder" numberOfLines={1} style={styles.note}>
          {note}
        </TText>
      ) : null}
      {right}
      {arrow ? <TIcon name="chevronRight" size="md" color={colors.textPlaceholder} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, minWidth: 0 },
  // Long translations: the title keeps at least ~55% of the row, the note ellipsizes.
  note: { flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
});
