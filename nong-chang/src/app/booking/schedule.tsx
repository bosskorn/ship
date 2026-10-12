import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NDatePicker, NScreen, NSection, NTabs, NText, NTimePicker, TimeSlot } from '@/components';
import { TECHNICIANS } from '@/data/technicians';
import { estimateEta } from '@/domain/dispatch';
import { formatDayDate } from '@/lib/format';
import { useApp } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

/** Mock availability: deterministic "full" slots per day; past slots disabled. */
function slotsFor(day: Date): TimeSlot[] {
  const now = new Date();
  return Array.from({ length: 10 }, (_, i) => {
    const hour = 8 + i;
    const at = new Date(day);
    at.setHours(hour, 0, 0, 0);
    const full = (day.getDate() + i) % 4 === 0 || at.getTime() < now.getTime() + 60 * 60_000;
    return { label: `${String(hour).padStart(2, '0')}:00`, hour, minute: 0, full };
  });
}

export default function Schedule() {
  const { state, setDraft } = useApp();
  const [mode, setMode] = useState<'asap' | 'scheduled'>(state.draft.schedule.mode);
  const [day, setDay] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [slot, setSlot] = useState<TimeSlot>();
  const slots = useMemo(() => slotsFor(day), [day]);

  const eta = useMemo(() => {
    const etas = TECHNICIANS.filter((t) => t.online && !t.busy).map((t) => estimateEta(t.distanceKm));
    const min = Math.min(...etas);
    return { min, max: min + 7 };
  }, []);

  const next = () => {
    if (mode === 'asap') setDraft({ schedule: { mode: 'asap' } });
    else if (slot) {
      const at = new Date(day);
      at.setHours(slot.hour, slot.minute, 0, 0);
      setDraft({ schedule: { mode: 'scheduled', at: at.toISOString() } });
    }
    router.push('/booking/summary');
  };

  return (
    <NScreen
      footer={
        <NBottomBar>
          <NButton theme="primary" block disabled={mode === 'scheduled' && !slot} onPress={next}>
            {mode === 'asap' ? 'ถัดไป' : slot ? `นัด ${formatDayDate(day)} ${slot.label}` : 'เลือกเวลา'}
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="เลือกเวลา" />
      <NTabs
        items={[
          { value: 'asap', label: 'เร็วที่สุด' },
          { value: 'scheduled', label: 'นัดหมาย' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'asap' ? (
        <NSection>
          <View style={styles.asap}>
            <NText variant="secondary" color="textSecondary">
              ช่างจะถึงประมาณ
            </NText>
            <NText variant="display" color="primary">
              {eta.min}–{eta.max} นาที
            </NText>
            <NText variant="secondary" color="textSecondary" align="center">
              น้องช่างจะจับคู่ช่างที่ใกล้และว่างที่สุดทันทีหลังยืนยัน
            </NText>
          </View>
        </NSection>
      ) : (
        <>
          <NSection title="วันที่" flush>
            <NDatePicker
              value={day}
              onChange={(d) => {
                setDay(d);
                setSlot(undefined);
              }}
            />
          </NSection>
          <NSection title="เวลา" flush>
            <NTimePicker slots={slots} value={slot?.label} onChange={setSlot} />
            <NText variant="caption" color="textSecondary" style={styles.note}>
              ช่างจะมาถึงภายใน 30 นาทีจากเวลาที่เลือก
            </NText>
          </NSection>
        </>
      )}
    </NScreen>
  );
}

const styles = StyleSheet.create({
  asap: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.xl, alignItems: 'center', gap: space.xs },
  note: { paddingHorizontal: layout.screenPadding, marginTop: space.sm },
});
