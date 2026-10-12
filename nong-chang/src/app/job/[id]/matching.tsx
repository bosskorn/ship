import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeMarker, NButton, NDialog, NDivider, NEmpty, NIcon, NMap, NSheetPanel, NTechnicianItem, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { hasReached } from '@/domain/job';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, layout, space } from '@/theme/tokens';

const PHASES = ['ค้นหาช่าง', 'พบช่าง', 'ส่งงาน', 'ช่างรับงาน'] as const;

/**
 * Signature screen (spec §28–29): full-screen map, pulse from the customer's
 * home, phased status text. No spinner. When a technician accepts, the
 * Technician Found sheet slides up in place.
 */
export default function Matching() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { cancelJob } = useApp();
  const insets = useSafeAreaInsets();
  const [searchPhase, setSearchPhase] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const matched = !!job && hasReached(job.status, 'matched');

  const phase = matched ? PHASES.length - 1 : searchPhase;

  // Advance the visible phases while the dispatcher works.
  useEffect(() => {
    if (matched) return;
    const t = setInterval(() => setSearchPhase((p) => Math.min(p + 1, PHASES.length - 2)), 1100);
    return () => clearInterval(t);
  }, [matched]);

  useEffect(() => {
    if (job?.status === 'cancelled') router.replace('/');
  }, [job?.status]);

  if (!job || job.status === 'cancelled') {
    return <NEmpty title="ไม่พบงานนี้" action={<NButton theme="outline" size="medium" onPress={() => router.replace('/')}>กลับหน้าแรก</NButton>} />;
  }
  const service = serviceById(job.serviceId);
  const region = { latitude: job.address.lat, longitude: job.address.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 };

  return (
    <View style={styles.root}>
      <NMap style={StyleSheet.absoluteFill} initialRegion={region} scrollEnabled={matched} zoomEnabled={false} />

      {/* Pulse from the customer's home (map is centred on it) */}
      <View pointerEvents="none" style={styles.center}>
        {!matched ? [0, 1, 2].map((i) => <Pulse key={i} delay={i * 600} />) : null}
        <HomeMarker />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <NButton theme="default" size="small" icon="back" onPress={() => router.replace('/')}>
          หน้าแรก
        </NButton>
      </View>

      {!matched ? (
        <NSheetPanel>
          <View style={styles.sheet}>
            <NText variant="h2">น้องช่างกำลังค้นหาช่างใกล้คุณ</NText>
            <NText variant="secondary" color="textSecondary">
              {service?.name} · {job.address.label}
            </NText>
            <View style={styles.phases}>
              {PHASES.map((p, i) => (
                <View key={p} style={styles.phase}>
                  <View style={[styles.bar, i <= phase && styles.barOn]} />
                  <NText variant="caption" color={i <= phase ? 'primary' : 'textPlaceholder'}>
                    {p}
                  </NText>
                </View>
              ))}
            </View>
            <NButton theme="text" size="small" onPress={() => setConfirmCancel(true)}>
              ยกเลิกการเรียกช่าง
            </NButton>
          </View>
        </NSheetPanel>
      ) : tech ? (
        <NSheetPanel>
          <View style={styles.sheet}>
            <View style={styles.found}>
              <NIcon name="check" size={20} color={color.success} strokeWidth={2.25} />
              <NText variant="h2">เจอช่างแล้ว</NText>
            </View>
            <NDivider />
            <NTechnicianItem technician={tech} etaMinutes={job.etaMinutes} />
            <View style={styles.actions}>
              <NButton theme="default" icon="phone" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${tech.phone}`)}>
                โทร
              </NButton>
              <NButton theme="default" icon="chat" style={{ flex: 1 }} onPress={() => router.push(`/chat/${job.id}`)}>
                ข้อความ
              </NButton>
            </View>
            <NButton theme="primary" block onPress={() => router.replace(`/job/${job.id}/tracking`)}>
              ติดตามช่าง
            </NButton>
          </View>
        </NSheetPanel>
      ) : null}

      <NDialog
        visible={confirmCancel}
        title="ยกเลิกการเรียกช่าง?"
        content="ยังไม่มีค่าใช้จ่าย เพราะยังไม่มีช่างรับงาน"
        cancelText="ค้นหาต่อ"
        confirmText="ยกเลิก"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          cancelJob(job.id);
          router.replace('/');
        }}
      />
    </View>
  );
}

function Pulse({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - p.value),
    transform: [{ scale: 0.2 + p.value * 1.2 }],
  }));
  return <Animated.View style={[styles.pulse, style]} />;
}

const PULSE = 260;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage, justifyContent: 'flex-end' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 200, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: PULSE, height: PULSE, borderRadius: PULSE / 2, backgroundColor: color.primary },
  top: { position: 'absolute', top: 0, left: layout.screenPadding },
  sheet: { paddingHorizontal: layout.screenPadding, gap: space.sm },
  phases: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  phase: { flex: 1, gap: space.xxs },
  bar: { height: 3, borderRadius: 2, backgroundColor: color.bgSecondary },
  barOn: { backgroundColor: color.primary },
  found: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
});
