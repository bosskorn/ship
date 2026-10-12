/** Loading & empty & error states: NSkeleton, NLoading, NEmpty, NErrorState, NOfflineBanner. */
import React, { useEffect } from 'react';
import { ActivityIndicator, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, FadeIn } from 'react-native-reanimated';

import { formatTime } from '@/lib/format';
import { color, layout, motion, radius, space } from '@/theme/tokens';

import { NButton } from './NButton';
import { IconName, NIcon } from './NIcon';
import { NText } from './NText';

/** Shimmer-free pulse; cheaper and calmer than a moving gradient. */
export function NSkeleton({ width = '100%', height = 16, radius: r = radius.sm, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.5, { duration: 700 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: color.bgSecondary }, animated, style]} />;
}

/** Skeleton for a typical list row (avatar/icon + two lines). */
export function NSkeletonRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <View style={styles.skRow}>
      {avatar ? <NSkeleton width={40} height={40} radius={radius.card} /> : null}
      <View style={{ flex: 1, gap: space.xs }}>
        <NSkeleton width="60%" />
        <NSkeleton width="35%" height={12} />
      </View>
    </View>
  );
}

/** Crossfade content in once loaded (replaces skeleton). */
export function NFadeIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <Animated.View entering={FadeIn.duration(motion.crossfade)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Inline loading only — never a full-screen spinner (spec §59). */
export function NLoading({ text }: { text?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="small" color={color.textSecondary} />
      {text ? (
        <NText variant="secondary" color="textSecondary">
          {text}
        </NText>
      ) : null}
    </View>
  );
}

export function NEmpty({ icon = 'jobs', title, description, action }: { icon?: IconName; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <NIcon name={icon} size={40} color={color.textPlaceholder} strokeWidth={1.25} />
      <NText variant="bodyStrong" align="center">
        {title}
      </NText>
      {description ? (
        <NText variant="secondary" color="textSecondary" align="center">
          {description}
        </NText>
      ) : null}
      {action ? <View style={{ marginTop: space.xs }}>{action}</View> : null}
    </View>
  );
}

/** Human error copy only — never HTTP codes, JSON or stack traces (spec §60). */
export function NErrorState({ onRetry, title = 'เชื่อมต่อไม่ได้', description = 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' }: { onRetry?: () => void; title?: string; description?: string }) {
  return (
    <NEmpty
      icon="wifi-off"
      title={title}
      description={description}
      action={onRetry ? <NButton theme="outline" size="medium" onPress={onRetry}>ลองใหม่</NButton> : undefined}
    />
  );
}

/** Shown when offline: cached data stays visible with its timestamp (spec §61). */
export function NOfflineBanner({ lastSyncedAt }: { lastSyncedAt?: string }) {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <NIcon name="wifi-off" size={16} color={color.warning} />
      <NText variant="caption" style={{ color: color.warning, flex: 1 }}>
        ออฟไลน์อยู่{lastSyncedAt ? ` · ข้อมูลล่าสุดเมื่อ ${formatTime(new Date(lastSyncedAt))}` : ''}
      </NText>
    </View>
  );
}

const styles = StyleSheet.create({
  skRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, backgroundColor: color.bgContainer },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.md },
  empty: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.xxl, paddingVertical: space.xxl * 2 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.xs,
    backgroundColor: color.warningLight,
  },
});
