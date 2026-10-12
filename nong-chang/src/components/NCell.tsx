import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, layout, radius, space } from '@/theme/tokens';

import { IconName, NIcon } from './NIcon';
import { NText } from './NText';

export interface NCellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  note?: React.ReactNode;
  leftIcon?: IconName;
  left?: React.ReactNode;
  right?: React.ReactNode;
  arrow?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Draw divider under this cell (set by NList). */
  divider?: boolean;
}

export function NCell({ title, description, note, leftIcon, left, right, arrow, onPress, disabled, divider }: NCellProps) {
  const content = (
    <View style={styles.row}>
      {left ?? (leftIcon ? <NIcon name={leftIcon} size={22} color={color.textSecondary} /> : null)}
      <View style={styles.main}>
        {typeof title === 'string' ? (
          <NText variant="body" color={disabled ? 'textDisabled' : 'textPrimary'}>
            {title}
          </NText>
        ) : (
          title
        )}
        {description ? (
          typeof description === 'string' ? (
            <NText variant="secondary" color="textSecondary">
              {description}
            </NText>
          ) : (
            description
          )
        ) : null}
      </View>
      {note ? (typeof note === 'string' ? <NText variant="secondary" color="textSecondary">{note}</NText> : note) : null}
      {right}
      {arrow ? <NIcon name="chevron-right" size={18} color={color.textPlaceholder} /> : null}
    </View>
  );
  const dividerEl = divider ? <View style={[styles.divider, { marginLeft: leftIcon || left ? 54 : layout.screenPadding }]} /> : null;
  if (!onPress) {
    return (
      <View style={styles.cell}>
        {content}
        {dividerEl}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.cell, pressed && { backgroundColor: color.bgSecondary }]}
    >
      {content}
      {dividerEl}
    </Pressable>
  );
}

/** Grouped list on a white container, dividers between cells. */
export function NList({ title, children, inset }: { title?: string; children: React.ReactNode; inset?: boolean }) {
  const items = React.Children.toArray(children).filter(Boolean) as React.ReactElement<NCellProps>[];
  return (
    <View>
      {title ? (
        <NText variant="secondary" color="textSecondary" style={styles.listTitle}>
          {title}
        </NText>
      ) : null}
      <View style={[styles.list, inset && styles.listInset]}>
        {items.map((child, i) =>
          React.isValidElement(child) && child.type === NCell ? React.cloneElement(child, { divider: i < items.length - 1 }) : child,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { backgroundColor: color.bgContainer },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
  },
  main: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider },
  list: { backgroundColor: color.bgContainer, overflow: 'hidden' },
  listInset: { marginHorizontal: layout.screenPadding, borderRadius: radius.card },
  listTitle: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xs },
});
