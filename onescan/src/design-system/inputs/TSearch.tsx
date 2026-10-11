import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TIcon } from '../icons/TIcon';
import { TText } from '../typography/TText';

export interface TSearchProps {
  placeholder: string;
  value?: string;
  onChangeText?: (v: string) => void;
  onSubmit?: () => void;
  /** Render as a tappable entry point (e.g. on Home) instead of an input. */
  onPressEntry?: () => void;
  autoFocus?: boolean;
  testID?: string;
}

export function TSearch({ placeholder, value, onChangeText, onSubmit, onPressEntry, autoFocus, testID }: TSearchProps) {
  const { colors, radius, spacing, typeScale, fontFamily } = useTheme();
  const container = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 40,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgSecondary,
  };

  if (onPressEntry) {
    return (
      <Pressable testID={testID} accessibilityRole="search" onPress={onPressEntry} style={container}>
        <TIcon name="search" size="md" color={colors.textPlaceholder} />
        <TText variant="body" color="textPlaceholder" numberOfLines={1}>
          {placeholder}
        </TText>
      </Pressable>
    );
  }

  return (
    <View style={container}>
      <TIcon name="search" size="md" color={colors.textPlaceholder} />
      <TextInput
        testID={testID}
        accessibilityRole="search"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        returnKeyType="search"
        style={[typeScale.body, { flex: 1, color: colors.textPrimary, fontFamily, paddingVertical: 0 }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="clear" onPress={() => onChangeText?.('')} hitSlop={8}>
          <TIcon name="close" size="sm" color={colors.textPlaceholder} />
        </Pressable>
      ) : null}
    </View>
  );
}
