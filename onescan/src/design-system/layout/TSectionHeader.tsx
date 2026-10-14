import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';

export function TSectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.xl,
        paddingBottom: spacing.xs,
      }}
    >
      <TText variant="title">{title}</TText>
      {actionLabel ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <TText variant="body" color="brand">
            {actionLabel}
          </TText>
        </Pressable>
      ) : null}
    </View>
  );
}
