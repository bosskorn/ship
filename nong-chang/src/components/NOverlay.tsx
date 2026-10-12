/** Overlays: NBottomSheet, NSheetPanel, NDialog, NToast. */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, SlideInDown, SlideInUp, SlideOutUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, elevation, layout, motion, radius, space } from '@/theme/tokens';

import { NButton } from './NButton';
import { NIcon } from './NIcon';
import { NText } from './NText';

const ease = Easing.bezier(0.2, 0, 0, 1);

/**
 * Modal bottom sheet. Slides up in ~300ms; tap the mask to dismiss.
 * Only the top corners are rounded (12).
 */
export function NBottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  // Mount synchronously when opening (derived state), unmount after the close animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: motion.sheet, easing: ease });
    } else {
      progress.value = withTiming(0, { duration: motion.sheet - 50, easing: ease });
      const t = setTimeout(() => setMounted(false), motion.sheet - 50);
      return () => clearTimeout(t);
    }
  }, [visible, progress]);

  const maskStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 600 }] }));

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent animationType="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.mask, maskStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
      </Animated.View>
      <Animated.View style={[styles.sheet, elevation.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }, sheetStyle]}>
        <View style={styles.grabber} />
        {title ? (
          <View style={styles.sheetHeader}>
            <NText variant="h3">{title}</NText>
            <Pressable accessibilityRole="button" accessibilityLabel="ปิด" hitSlop={10} onPress={onClose}>
              <NIcon name="close" size={22} color={color.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <View>{children}</View>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </Animated.View>
    </Modal>
  );
}

/** Non-modal sheet docked above a map (tracking, matching, address). */
export function NSheetPanel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={SlideInDown.duration(motion.sheet).easing(ease)}
      style={[styles.panel, elevation.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }, style]}
    >
      <View style={styles.grabber} />
      {children}
    </Animated.View>
  );
}

export function NDialog({
  visible,
  title,
  content,
  confirmText = 'ตกลง',
  cancelText,
  onConfirm,
  onCancel,
  destructive,
}: {
  visible: boolean;
  title: string;
  content?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  destructive?: boolean;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel ?? onConfirm} statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, styles.mask, styles.center]}>
        <View style={[styles.dialog, elevation.dialog]}>
          <NText variant="h3" align="center">
            {title}
          </NText>
          {content ? (
            typeof content === 'string' ? (
              <NText variant="secondary" color="textSecondary" align="center">
                {content}
              </NText>
            ) : (
              content
            )
          ) : null}
          <View style={styles.dialogActions}>
            {cancelText ? (
              <NButton block size="medium" onPress={onCancel}>
                {cancelText}
              </NButton>
            ) : null}
            <NButton block size="medium" theme={destructive ? 'danger' : 'primary'} onPress={onConfirm}>
              {confirmText}
            </NButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* --------------------------------- Toast --------------------------------- */

type ToastTheme = 'info' | 'success' | 'warning' | 'error';
interface ToastMsg {
  id: number;
  text: string;
  theme: ToastTheme;
  onPress?: () => void;
}
const ToastCtx = createContext<(text: string, opts?: { theme?: ToastTheme; onPress?: () => void }) => void>(() => {});

export function NToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string, opts: { theme?: ToastTheme; onPress?: () => void } = {}) => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, theme: opts.theme ?? 'info', onPress: opts.onPress });
    timer.current = setTimeout(() => setMsg(null), 3000);
  }, []);

  const icon = msg?.theme === 'success' ? 'check' : msg?.theme === 'error' || msg?.theme === 'warning' ? 'help' : 'bell';

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          key={msg.id}
          entering={SlideInUp.duration(motion.sheet).easing(ease)}
          exiting={SlideOutUp.duration(motion.micro)}
          style={[styles.toastWrap, { top: insets.top + space.xs }]}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityRole="alert"
            onPress={() => {
              setMsg(null);
              msg.onPress?.();
            }}
            style={[styles.toast, elevation.floating]}
          >
            <NIcon name={icon} size={18} color={color.textOnPrimary} />
            <NText variant="secondary" style={styles.toastText} numberOfLines={2}>
              {msg.text}
            </NText>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  mask: { backgroundColor: color.bgMask },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: color.bgElevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  panel: {
    backgroundColor: color.bgElevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, marginTop: space.xs, marginBottom: space.xs },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  sheetFooter: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  dialog: { width: '100%', maxWidth: 340, backgroundColor: color.bgElevated, borderRadius: radius.dialog, padding: space.xl, gap: space.sm },
  dialogActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  toastWrap: { position: 'absolute', left: layout.screenPadding, right: layout.screenPadding, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: 'rgba(24,24,24,0.92)', borderRadius: radius.card, paddingHorizontal: space.md, paddingVertical: space.sm },
  toastText: { color: color.textOnPrimary, flex: 1 },
});
