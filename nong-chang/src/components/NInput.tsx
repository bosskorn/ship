import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';

import { color, radius, space, typography } from '@/theme/tokens';

import { NIcon } from './NIcon';
import { NText } from './NText';

export interface NInputProps extends TextInputProps {
  label?: string;
  error?: string;
  suffix?: React.ReactNode;
}

export const NInput = forwardRef<TextInput, NInputProps>(function NInput({ label, error, suffix, style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <NText variant="secondary" color="textSecondary">
          {label}
        </NText>
      ) : null}
      <View style={[styles.box, { borderColor: error ? color.error : focused ? color.primary : color.border }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={color.textPlaceholder}
          selectionColor={color.primary}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {suffix}
      </View>
      {error ? (
        <NText variant="caption" color="error">
          {error}
        </NText>
      ) : null}
    </View>
  );
});

/**
 * Search field. When `onPress` is given it acts as an entry point (navigates
 * to the search screen) instead of an editable input.
 */
export function NSearch({
  placeholder = 'ค้นหาบริการหรืออธิบายปัญหา',
  onPress,
  onCameraPress,
  ...rest
}: TextInputProps & { onPress?: () => void; onCameraPress?: () => void }) {
  const field = (
    <View style={styles.search}>
      <NIcon name="search" size={20} color={color.textSecondary} />
      {onPress ? (
        <NText variant="body" color="textPlaceholder" style={{ flex: 1 }} numberOfLines={1}>
          {placeholder}
        </NText>
      ) : (
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={color.textPlaceholder}
          selectionColor={color.primary}
          returnKeyType="search"
          style={[styles.input, { paddingHorizontal: 0 }]}
          {...rest}
        />
      )}
      {onCameraPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel="ถ่ายรูปปัญหา" hitSlop={8} onPress={onCameraPress}>
          <NIcon name="camera" size={20} color={color.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="search" onPress={onPress}>
      {field}
    </Pressable>
  ) : (
    field
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xxs },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.input, backgroundColor: color.bgContainer, minHeight: 44 },
  input: { ...typography.body, flex: 1, color: color.textPrimary, paddingHorizontal: space.sm, paddingVertical: space.xs },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.input,
    backgroundColor: color.bgSecondary,
  },
});
