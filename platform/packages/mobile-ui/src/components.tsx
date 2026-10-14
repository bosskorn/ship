import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { color, font, radius, space, Tone, toneColors, TOUCH } from './theme';

export function Screen({ children, scroll = true, style, padded = false }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const inner = <View style={[padded && { padding: space.lg }, style]}>{children}</View>;
  if (!scroll) return <View style={[styles.screen, padded && { padding: space.lg }, style]}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'text' | 'danger';
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  block = true,
  size = 'large',
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  size?: 'large' | 'medium' | 'small';
  style?: StyleProp<ViewStyle>;
}) {
  const h = size === 'large' ? TOUCH : size === 'medium' ? 40 : 32;
  const palette = {
    primary: { bg: color.brand, fg: '#fff', border: color.brand },
    danger: { bg: color.danger, fg: '#fff', border: color.danger },
    outline: { bg: color.surface, fg: color.text, border: color.border },
    text: { bg: 'transparent', fg: color.brand, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: space.lg,
          borderRadius: radius.sm,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[size === 'small' ? font.small : font.bodyStrong, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Grouped list section with an optional title (like TDesign Cell group). */
export function Section({ title, children, right, style }: { title?: string; children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.md }, style]}>
      {(title || right) && (
        <View style={styles.sectionHead}>
          {title ? <Text style={[font.small, { color: color.text2 }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** One row: label, optional description, right-hand value/arrow. */
export function Cell({
  title,
  description,
  value,
  left,
  onPress,
  arrow,
  last,
}: {
  title: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  arrow?: boolean;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.cell, !last && styles.cellBorder]}>
      {left && <View style={{ marginRight: space.md }}>{left}</View>}
      <View style={{ flex: 1 }}>
        {typeof title === 'string' ? <Text style={font.body}>{title}</Text> : title}
        {description ? (
          typeof description === 'string' ? (
            <Text style={[font.small, { color: color.text3, marginTop: 2 }]} numberOfLines={2}>
              {description}
            </Text>
          ) : (
            description
          )
        ) : null}
      </View>
      {value !== undefined && (typeof value === 'string' ? <Text style={[font.body, { color: color.text2, marginLeft: space.sm }]}>{value}</Text> : value)}
      {arrow && <Text style={{ color: color.placeholder, marginLeft: space.sm, fontSize: 18 }}>›</Text>}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? color.divider : color.surface })}>
      {body}
    </Pressable>
  );
}

export function Tag({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
      <Text style={[font.caption, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: color.surface }}>
      <Text style={[font.caption, { color: color.text3, marginBottom: 2 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={color.placeholder}
        style={[font.body, { minHeight: 36, color: color.text, paddingVertical: 4 }]}
        {...props}
      />
      {error ? <Text style={[font.caption, { color: color.danger }]}>{error}</Text> : hint ? <Text style={[font.caption, { color: color.text3 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.border, marginLeft: space.lg }} />;
}

/** Segmented control (period / filter switchers). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: color.surface, borderColor: color.border }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[font.small, { color: active ? color.text : color.text2, fontWeight: active ? '600' : '400' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fixed bottom action bar for primary CTAs. */
export function BottomBar({ children }: { children: ReactNode }) {
  return <View style={styles.bottomBar}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <Text style={[font.small, { color: color.text3 }]}>{text}</Text>
    </View>
  );
}

export function Money({ satang, size = 'body', strong }: { satang: number; size?: 'body' | 'number' | 'small'; strong?: boolean }) {
  const s = size === 'number' ? font.number : size === 'small' ? font.small : strong ? font.bodyStrong : font.body;
  const baht = satang / 100;
  const text = `฿${baht.toLocaleString('th-TH', { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return <Text style={[s, { fontVariant: ['tabular-nums'] }]}>{text}</Text>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.xs },
  sectionBody: { backgroundColor: color.surface, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  cell: { minHeight: TOUCH + 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  cellBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  segmented: { flexDirection: 'row', backgroundColor: color.divider, borderRadius: radius.sm, padding: 2 },
  segment: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  bottomBar: { backgroundColor: color.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, padding: space.md, paddingBottom: space.lg, gap: space.sm },
});

/** Badge shown while running on simulated data. */
export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={{ backgroundColor: color.warningLight, borderColor: color.warning, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm }}>
      <Text style={[font.caption, { color: color.warning }]}>โหมดสาธิต</Text>
    </View>
  );
}
