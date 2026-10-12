/**
 * Native date / time pickers rendered inside a bottom sheet (spec §26) —
 * never an HTML date input. Full slots are disabled, not hidden.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatShortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { color, layout, radius, space } from '@/theme/tokens';

import { NText } from './NText';

const DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export function NDatePicker({ value, onChange, days = 14 }: { value: Date; onChange: (d: Date) => void; days?: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const list = Array.from({ length: days }, (_, i) => new Date(today.getTime() + i * 86_400_000));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
      {list.map((d, i) => {
        const selected = d.toDateString() === value.toDateString();
        return (
          <Pressable
            key={d.toISOString()}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              haptic.select();
              onChange(d);
            }}
            style={[styles.date, selected && styles.selected]}
          >
            <NText variant="caption" style={{ color: selected ? color.primary : color.textSecondary }}>
              {i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : DAY[d.getDay()]}
            </NText>
            <NText variant="bodyStrong" style={{ color: selected ? color.primary : color.textPrimary }}>
              {formatShortDate(d)}
            </NText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface TimeSlot {
  label: string; // "09:00"
  hour: number;
  minute: number;
  full?: boolean;
}

export function NTimePicker({ slots, value, onChange }: { slots: TimeSlot[]; value?: string; onChange: (slot: TimeSlot) => void }) {
  return (
    <View style={styles.slotGrid}>
      {slots.map((s) => {
        const selected = s.label === value;
        return (
          <Pressable
            key={s.label}
            disabled={s.full}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: s.full }}
            onPress={() => {
              haptic.select();
              onChange(s);
            }}
            style={[styles.slot, selected && styles.selected, s.full && styles.slotFull]}
          >
            <NText variant="secondaryStrong" style={{ color: s.full ? color.textDisabled : selected ? color.primary : color.textPrimary }}>
              {s.label}
            </NText>
            {s.full ? (
              <NText variant="caption" color="textDisabled">
                เต็ม
              </NText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: { gap: space.xs, paddingHorizontal: layout.screenPadding },
  date: {
    width: 72,
    paddingVertical: space.xs,
    alignItems: 'center',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.bgContainer,
  },
  selected: { borderColor: color.primary, backgroundColor: color.primaryLight },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingHorizontal: layout.screenPadding },
  slot: {
    width: '31.5%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.bgContainer,
  },
  slotFull: { backgroundColor: color.bgDisabled, borderColor: color.bgDisabled },
});
