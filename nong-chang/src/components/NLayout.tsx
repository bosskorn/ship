/** Screen scaffolding: NScreen, NAppBar, NSection, NDivider, NBottomBar. */
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, layout, space } from '@/theme/tokens';

import { NIconButton } from './NButton';
import { NText } from './NText';

export function NAppBar({
  title,
  back = true,
  onBack,
  right,
  transparent,
  inset = true,
}: {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  transparent?: boolean;
  inset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.appBar,
        { paddingTop: inset ? insets.top : 0, backgroundColor: transparent ? 'transparent' : color.bgContainer },
        !transparent && styles.appBarBorder,
      ]}
    >
      <View style={styles.appBarRow}>
        <View style={styles.appBarSide}>
          {back ? (
            <NIconButton
              icon="back"
              accessibilityLabel="ย้อนกลับ"
              bordered={transparent}
              onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
            />
          ) : null}
        </View>
        <NText variant="h3" numberOfLines={1} style={styles.appBarTitle}>
          {title}
        </NText>
        <View style={[styles.appBarSide, styles.appBarRight]}>{right}</View>
      </View>
    </View>
  );
}

export function NScreen({
  children,
  scroll = true,
  footer,
  background = 'page',
  contentStyle,
  ...scrollProps
}: {
  children: React.ReactNode;
  scroll?: boolean;
  footer?: React.ReactNode;
  background?: 'page' | 'container';
  contentStyle?: ViewStyle;
} & ScrollViewProps) {
  const bg = background === 'page' ? color.bgPage : color.bgContainer;
  return (
    <View style={[styles.flex, { backgroundColor: bg }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[{ paddingBottom: space.xxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
      {footer}
    </View>
  );
}

/** Fixed bottom action area. One primary CTA per screen lives here. */
export function NBottomBar({ children, summary }: { children: React.ReactNode; summary?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {summary ? <View style={styles.bottomSummary}>{summary}</View> : null}
      <View style={styles.bottomActions}>{children}</View>
    </View>
  );
}

export function NSection({
  title,
  action,
  children,
  flush,
  style,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Remove horizontal padding (for full-width lists). */
  flush?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginTop: layout.sectionGap }, style]}>
      {title || action ? (
        <View style={styles.sectionHeader}>
          {title ? <NText variant="h3">{title}</NText> : <View />}
          {action}
        </View>
      ) : null}
      <View style={flush ? undefined : { paddingHorizontal: layout.screenPadding }}>{children}</View>
    </View>
  );
}

export function NDivider({ inset = 0, style }: { inset?: number; style?: ViewStyle }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginLeft: inset }, style]} />;
}

export function NRow({ children, gap = space.xs, style, align = 'center' }: { children: React.ReactNode; gap?: number; style?: ViewStyle; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  appBar: { zIndex: 2 },
  appBarBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  appBarRow: { height: layout.appBarHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxs },
  appBarSide: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  appBarRight: { justifyContent: 'flex-end' },
  appBarTitle: { flex: 1, textAlign: 'center' },
  bottomBar: {
    backgroundColor: color.bgContainer,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  bottomSummary: { marginBottom: space.sm },
  bottomActions: { flexDirection: 'row', gap: space.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    marginBottom: space.sm,
  },
});

