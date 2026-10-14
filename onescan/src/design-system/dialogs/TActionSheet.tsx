import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { IconName, TIcon } from '../icons/TIcon';

export interface TActionSheetItem {
  key: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
}

/** Bottom drawer for context menus (progressive disclosure of actions). */
export function TActionSheet({
  visible,
  title,
  items,
  cancelLabel,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title?: string;
  items: TActionSheetItem[];
  cancelLabel: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.bgMask }} onPress={onClose} accessibilityLabel={cancelLabel} />
      {/* Android bottom sheet: drag handle, start-aligned title, no cancel row (scrim / back closes). */}
      <View
        style={{
          backgroundColor: colors.bgContainer,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: insets.bottom + spacing.xs,
          overflow: 'hidden',
        }}
      >
        <View style={{ alignItems: 'center', paddingTop: spacing.xs, paddingBottom: spacing.xxs }}>
          <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>
        {title ? (
          <TText variant="title" numberOfLines={1} style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xs }}>
            {title}
          </TText>
        ) : null}
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            onPress={() => onSelect(it.key)}
            style={({ pressed }) => ({
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.xl,
              backgroundColor: pressed ? colors.bgPressed : 'transparent',
            })}
          >
            {it.icon ? <TIcon name={it.icon} size="lg" color={it.danger ? colors.error : colors.textSecondary} /> : null}
            <TText variant="bodyLarge" color={it.danger ? 'error' : 'textPrimary'} style={{ flexShrink: 1 }}>
              {it.label}
            </TText>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}
