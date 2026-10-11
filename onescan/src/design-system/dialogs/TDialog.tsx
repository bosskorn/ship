import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { TText } from '../typography/TText';
import { TDivider } from '../layout/TDivider';

export interface TDialogAction {
  label: string;
  onPress: () => void;
  /** `primary` = brand bold, `danger` = error color, `default` = secondary text. */
  tone?: 'primary' | 'danger' | 'default';
}

export interface TDialogProps {
  visible: boolean;
  title: string;
  content?: string;
  children?: React.ReactNode;
  actions: TDialogAction[];
  /** Vertical stacking for 3+ actions or long labels. */
  stacked?: boolean;
  onRequestClose: () => void;
}

export function TDialog({ visible, title, content, children, actions, stacked, onRequestClose }: TDialogProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  const vertical = stacked ?? actions.length > 2;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose} statusBarTranslucent>
      <View style={[styles.mask, { backgroundColor: colors.bgMask, padding: spacing.xxl }]}>
        <View
          accessibilityViewIsModal
          style={[{ width: '100%', maxWidth: 360, backgroundColor: colors.bgContainer, borderRadius: radius.lg, overflow: 'hidden' }, elevation.overlay]}
        >
          <View style={{ padding: spacing.xl, gap: spacing.xs }}>
            <TText variant="title" align="center" accessibilityRole="header">
              {title}
            </TText>
            {content ? (
              <TText variant="body" color="textSecondary" align="center">
                {content}
              </TText>
            ) : null}
            {children}
          </View>
          <TDivider />
          <View style={{ flexDirection: vertical ? 'column' : 'row' }}>
            {actions.map((a, i) => (
              <React.Fragment key={a.label}>
                {i > 0 ? (
                  vertical ? <TDivider /> : <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={a.onPress}
                  style={({ pressed }) => ({
                    flex: vertical ? undefined : 1,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.bgPressed : 'transparent',
                  })}
                >
                  <TText
                    variant="bodyLarge"
                    weight={a.tone === 'primary' ? '600' : '400'}
                    color={a.tone === 'primary' ? 'brand' : a.tone === 'danger' ? 'error' : 'textPrimary'}
                  >
                    {a.label}
                  </TText>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
