/** Small display components: NTag, NBadge, NAvatar, NRating, NPrice, NProgress. */
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { formatBaht } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { color, radius, space, typography } from '@/theme/tokens';

import { NIcon } from './NIcon';
import { NText } from './NText';

export type Tone = 'primary' | 'success' | 'warning' | 'error' | 'default';

const toneColor: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: color.primary, bg: color.primaryLight },
  success: { fg: color.success, bg: color.successLight },
  warning: { fg: color.warning, bg: color.warningLight },
  error: { fg: color.error, bg: color.errorLight },
  default: { fg: color.textSecondary, bg: color.bgSecondary },
};

/** Pill shape is reserved for tags, statuses and filters (spec §9). */
export function NTag({ children, tone = 'default', variant = 'light', shape = 'pill', size = 'medium' }: {
  children: React.ReactNode;
  tone?: Tone;
  variant?: 'light' | 'outline' | 'dark';
  shape?: 'pill' | 'square';
  size?: 'small' | 'medium';
}) {
  const c = toneColor[tone];
  const style: ViewStyle = {
    backgroundColor: variant === 'light' ? c.bg : variant === 'dark' ? c.fg : 'transparent',
    borderColor: variant === 'outline' ? c.fg : 'transparent',
    borderRadius: shape === 'pill' ? radius.pill : radius.sm,
    paddingHorizontal: size === 'small' ? 6 : space.xs,
    height: size === 'small' ? 20 : 24,
  };
  return (
    <View style={[styles.tag, style]}>
      <NText variant="caption" style={{ color: variant === 'dark' ? color.textOnPrimary : c.fg }} numberOfLines={1}>
        {children}
      </NText>
    </View>
  );
}

/** Selectable filter chip (pill). */
export function NChip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? color.primary : color.border,
          backgroundColor: disabled ? color.bgDisabled : selected ? color.primaryLight : pressed ? color.bgSecondary : color.bgContainer,
        },
      ]}
    >
      <NText variant="secondary" style={{ color: disabled ? color.textDisabled : selected ? color.primary : color.textPrimary }}>
        {label}
      </NText>
    </Pressable>
  );
}

export function NBadge({ count, dot, max = 99 }: { count?: number; dot?: boolean; max?: number }) {
  if (dot) return <View style={styles.dot} />;
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <NText variant="caption" style={styles.badgeText}>
        {count > max ? `${max}+` : count}
      </NText>
    </View>
  );
}

export function NAvatar({ initials, size = 48, verified, tone = 'primary' }: { initials: string; size?: number; verified?: boolean; tone?: 'primary' | 'neutral' }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tone === 'primary' ? color.primaryLight : color.bgSecondary },
        ]}
      >
        <NText style={{ fontSize: size * 0.36, lineHeight: size * 0.5, color: tone === 'primary' ? color.primary : color.textSecondary, fontWeight: '500' }}>
          {initials}
        </NText>
      </View>
      {verified ? (
        <View style={styles.verified}>
          <NIcon name="verified" size={size * 0.38} color={color.primary} />
        </View>
      ) : null}
    </View>
  );
}

export function NRating({ value, size = 16, onChange, gap = 2 }: { value: number; size?: number; onChange?: (v: number) => void; gap?: number }) {
  return (
    <View style={[styles.rating, { gap }]} accessibilityRole={onChange ? 'adjustable' : undefined} accessibilityValue={{ min: 0, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const icon = <NIcon name={i <= Math.round(value) ? 'star-filled' : 'star'} size={size} color={i <= Math.round(value) ? '#F5A623' : color.border} />;
        return onChange ? (
          <Pressable
            key={i}
            accessibilityLabel={`${i} ดาว`}
            hitSlop={6}
            onPress={() => {
              haptic.select();
              onChange(i);
            }}
          >
            {icon}
          </Pressable>
        ) : (
          <View key={i}>{icon}</View>
        );
      })}
    </View>
  );
}

/** Price with a larger number than its unit (spec §7). */
export function NPrice({
  amount,
  size = 'medium',
  unit = 'บาท',
  decimals,
  strike,
  tone = 'textPrimary',
  prefix,
}: {
  amount: number;
  size?: 'small' | 'medium' | 'large' | 'display';
  unit?: string;
  decimals?: boolean;
  strike?: boolean;
  tone?: 'textPrimary' | 'primary' | 'textSecondary' | 'success';
  prefix?: string;
}) {
  const num = { small: typography.bodyStrong, medium: typography.h2, large: typography.h1, display: typography.display }[size];
  const unitStyle = size === 'small' ? typography.caption : typography.secondary;
  return (
    <View style={styles.price} accessibilityLabel={`${formatBaht(amount, { decimals })} ${unit}`}>
      <NText style={[num, { color: color[tone] }, strike && styles.strike]}>
        {prefix}
        {formatBaht(amount, { decimals })}
      </NText>
      <NText style={[unitStyle, { color: color.textSecondary }]}> {unit}</NText>
    </View>
  );
}

export function NProgress({ value, tone = 'primary', height = 4 }: { value: number; tone?: Tone; height?: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height, borderRadius: height / 2, backgroundColor: toneColor[tone].fg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chip: { height: 32, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.error },
  badge: { minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: color.error, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: color.textOnPrimary, fontSize: 10, lineHeight: 14 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  verified: { position: 'absolute', right: -2, bottom: -2, backgroundColor: color.bgContainer, borderRadius: 999 },
  rating: { flexDirection: 'row', alignItems: 'center' },
  price: { flexDirection: 'row', alignItems: 'baseline' },
  strike: { textDecorationLine: 'line-through', color: color.textPlaceholder },
  track: { backgroundColor: color.bgSecondary, overflow: 'hidden' },
});
