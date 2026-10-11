import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { TDivider } from '../layout/TDivider';
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
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.bgMask }} onPress={onClose} accessibilityLabel={cancelLabel} />
      <View
        style={{
          backgroundColor: colors.bgContainer,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          paddingBottom: insets.bottom,
          overflow: 'hidden',
        }}
      >
        {title ? (
          <>
            <TText variant="bodySmall" color="textSecondary" align="center" style={{ padding: spacing.sm }} numberOfLines={1}>
              {title}
            </TText>
            <TDivider />
          </>
        ) : null}
        {items.map((it, i) => (
          <React.Fragment key={it.key}>
            {i > 0 ? <TDivider /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(it.key)}
              style={({ pressed }) => ({
                height: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingHorizontal: spacing.xl,
                backgroundColor: pressed ? colors.bgPressed : 'transparent',
              })}
            >
              {it.icon ? <TIcon name={it.icon} size="md" color={it.danger ? colors.error : colors.textPrimary} /> : null}
              <TText variant="bodyLarge" color={it.danger ? 'error' : 'textPrimary'}>
                {it.label}
              </TText>
            </Pressable>
          </React.Fragment>
        ))}
        <View style={{ height: spacing.xs, backgroundColor: colors.bgPage }} />
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => ({ height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.bgPressed : 'transparent' })}
        >
          <TText variant="bodyLarge">{cancelLabel}</TText>
        </Pressable>
      </View>
    </Modal>
  );
}
