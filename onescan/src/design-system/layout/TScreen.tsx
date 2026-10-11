import React from 'react';
import { ScrollView, View, ViewStyle } from 'react-native';
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
}

export function TScreen({ children, scroll, surface = 'page', edges = ['top'], header, footer, contentStyle }: TScreenProps) {
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
