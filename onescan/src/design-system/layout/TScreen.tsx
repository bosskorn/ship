import React from 'react';
import { RefreshControl, ScrollView, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

export interface TScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  /** Use container background (white) instead of page gray. */
  surface?: 'page' | 'container';
  edges?: Edge[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
  /** Pull to refresh (scroll screens). */
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function TScreen({ children, scroll, surface = 'page', edges = ['top'], header, footer, contentStyle, refreshing, onRefresh }: TScreenProps) {
  const { colors, spacing } = useTheme();
  const bg = surface === 'page' ? colors.bgPage : colors.bgContainer;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ paddingBottom: spacing.xxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}
