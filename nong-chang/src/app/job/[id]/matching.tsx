import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Linking, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NButton, NDialog, NEmpty, NIcon, NMap, NSheetPanel, NTechnicianItem, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { TECHNICIANS, type Technician } from '@/data/technicians';
import { rankCandidates } from '@/domain/dispatch';
import { hasReached } from '@/domain/job';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, elevation, layout, radius, space } from '@/theme/tokens';

const DELTA = 0.068;
const SHEET_H = 250;

/**
 * Signature screen (spec §28, directive V2 §27). Full map, the customer's home
 * in the centre, radar pulse, nearby technicians pop in, then the chosen one
 * is highlighted and the Technician Found sheet slides up.
 */
export default function Matching() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { cancelJob } = useApp();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState(0); // 0 searching · 1 found N · 2 sending
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const matched = !!job && hasReached(job.status, 'matched');
  const service = job ? serviceById(job.serviceId) : undefined;

  const nearby = useMemo(
    () => rankCandidates(TECHNICIANS, { skill: service?.categoryId ?? 'aircon' }).map((r) => r.candidate as Technician),
    [service?.categoryId],
  );

  useEffect(() => {
    if (matched) return;
    const a = setTimeout(() => setPhase(1), 1200);
    const b = setTimeout(() => setPhase(2), 2400);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [matched]);

  useEffect(() => {
    if (job?.status === 'cancelled') router.replace('/');
  }, [job?.status]);

  if (!job || job.status === 'cancelled') {
    return <NEmpty title="ไม่พบงานนี้" action={<NButton theme="outline" size="medium" onPress={() => router.replace('/')}>กลับหน้าแรก</NButton>} />;
  }

  const shownPhase = matched ? 3 : phase;
  const headline = ['กำลังหาน้องช่างใกล้คุณ', `พบช่าง ${nearby.length} คน`, 'กำลังส่งงานให้ช่าง', 'ได้ช่างแล้ว!'][shownPhase];
  const chosenId = tech?.id ?? nearby[0]?.id;

  // Project technician offsets onto the (fixed) map viewport.
  const project = (t: Technician) => ({
    left: box.w / 2 + (t.offset.lng / DELTA) * box.w,
    top: box.h / 2 - (t.offset.lat / (DELTA * (box.h / Math.max(box.w, 1)))) * box.h,
  });

  return (
    <View style={styles.root}>
      <View style={[styles.mapArea, { bottom: SHEET_H - radius.dialog }]} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <NMap
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: job.address.lat, longitude: job.address.lng, latitudeDelta: DELTA * (box.h / Math.max(box.w, 1) || 1.5), longitudeDelta: DELTA }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        />
        <View style={styles.mapTint} pointerEvents="none" />

        {/* Radar pulse from the home */}
        <View pointerEvents="none" style={styles.center}>
          {!matched ? [0, 1, 2].map((i) => <Pulse key={i} delay={i * 650} />) : null}
          <HomePin />
        </View>

        {/* Technician blips */}
        {box.w > 0 && shownPhase >= 1
          ? nearby.map((t, i) => {
              const pos = project(t);
              const chosen = t.id === chosenId;
              const dim = shownPhase >= 2 && !chosen;
              return (
                <Animated.View
                  key={t.id}
                  entering={ZoomIn.delay(i * 90).springify().damping(14)}
                  pointerEvents="none"
                  style={[styles.blipWrap, { left: pos.left - 18, top: pos.top - 18, opacity: dim ? 0.35 : 1 }]}
                >
                  {chosen && shownPhase >= 2 ? <Ring /> : null}
                  <View style={[styles.blip, chosen && shownPhase >= 2 && styles.blipChosen]}>
                    <NIcon name="navigation" size={14} color={chosen && shownPhase >= 2 ? color.textOnPrimary : color.primary} strokeWidth={2.2} />
                  </View>
                </Animated.View>
              );
            })
          : null}

        <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
          <NButton theme="default" size="small" icon="back" onPress={() => router.replace('/')}>
            หน้าแรก
          </NButton>
        </View>
      </View>

      {!matched ? (
        <NSheetPanel>
          <View style={styles.sheet}>
            <Animated.View key={shownPhase} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
              <NText variant="h1">{headline}</NText>
            </Animated.View>
            <NText variant="secondary" color="textSecondary">
              {service?.name} · {job.address.label} {job.address.district}
            </NText>
            <View style={styles.phases}>
              {['ค้นหา', 'พบช่าง', 'ส่งงาน', 'ช่างรับงาน'].map((p, i) => (
                <View key={p} style={styles.phase}>
                  <PhaseBar state={i < shownPhase ? 'done' : i === shownPhase ? 'active' : 'idle'} />
                  <NText variant="label" style={{ color: i <= shownPhase ? color.primary : color.textPlaceholder }}>
                    {p}
                  </NText>
                </View>
              ))}
            </View>
            <NText variant="caption" color="textSecondary">
              เราเลือกช่างจากระยะทาง ความเชี่ยวชาญ และคะแนนรีวิว
            </NText>
            <NButton theme="text" size="small" onPress={() => setConfirmCancel(true)}>
              ยกเลิกการเรียกช่าง
            </NButton>
          </View>
        </NSheetPanel>
      ) : tech ? (
        <NSheetPanel>
          <View style={styles.sheet}>
            <View style={styles.found}>
              <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.foundCheck}>
                <NIcon name="check" size={18} color={color.textOnPrimary} strokeWidth={3} />
              </Animated.View>
              <NText variant="h1">ได้ช่างแล้ว!</NText>
            </View>
            <NTechnicianItem technician={tech} />
            <View style={styles.stats}>
              <Stat value={tech.rating.toFixed(1)} label="คะแนน" />
              <Stat value={tech.jobs.toLocaleString()} label="งานสำเร็จ" />
              <Stat value={`${job.etaMinutes ?? '–'} นาที`} label="ถึงประมาณ" highlight />
            </View>
            {tech.vehicle ? (
              <View style={styles.vehicle}>
                <NText variant="caption" color="textSecondary">
                  รถ
                </NText>
                <NText variant="secondaryStrong">{tech.vehicle}</NText>
              </View>
            ) : null}
            <View style={styles.actions}>
              <NButton theme="default" icon="phone" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${tech.phone}`)}>
                โทร
              </NButton>
              <NButton theme="default" icon="chat" style={{ flex: 1 }} onPress={() => router.push(`/chat/${job.id}`)}>
                ข้อความ
              </NButton>
            </View>
            <NButton theme="primary" block icon="navigation" onPress={() => router.replace(`/job/${job.id}/tracking`)}>
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

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <NText variant="h3" color={highlight ? 'primary' : 'textPrimary'}>
        {value}
      </NText>
      <NText variant="caption" color="textSecondary">
        {label}
      </NText>
    </View>
  );
}

function PhaseBar({ state }: { state: 'done' | 'active' | 'idle' }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (state === 'active') p.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 0 })), -1, false);
  }, [state, p]);
  const fill = useAnimatedStyle(() => ({ width: state === 'done' ? '100%' : state === 'active' ? `${20 + p.value * 80}%` : '0%' }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

function HomePin() {
  return (
    <View style={[styles.home, elevation.floating]}>
      <NIcon name="home-filled" size={20} color={color.textOnPrimary} />
    </View>
  );
}

function Ring() {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false);
  }, [s]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - s.value), transform: [{ scale: 1 + s.value * 1.2 }] }));
  return <Animated.View style={[styles.ring, style]} />;
}

function Pulse({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1950, easing: Easing.out(Easing.quad) }), -1, false));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - p.value), transform: [{ scale: 0.15 + p.value * 1.15 }] }));
  return <Animated.View style={[styles.pulse, style]} />;
}

const PULSE = 320;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage, justifyContent: 'flex-end' },
  mapArea: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  mapTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,95,255,0.06)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: PULSE, height: PULSE, borderRadius: PULSE / 2, backgroundColor: color.primary, borderWidth: 2, borderColor: color.accent },
  home: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.primary, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  blipWrap: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  blip: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color.primary, alignItems: 'center', justifyContent: 'center', ...elevation.floating },
  blipChosen: { backgroundColor: color.primary, borderColor: '#FFFFFF', width: 34, height: 34, borderRadius: 17 },
  ring: { position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: color.primary },
  top: { position: 'absolute', top: 0, left: layout.screenPadding },
  sheet: { paddingHorizontal: layout.screenPadding, gap: space.sm },
  phases: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  phase: { flex: 1, gap: space.xxs },
  bar: { height: 4, borderRadius: 2, backgroundColor: color.bgSecondary, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: color.primary },
  found: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  foundCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.success, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: color.bgPage, borderRadius: radius.card, paddingVertical: space.sm },
  stat: { flex: 1, alignItems: 'center' },
  vehicle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: space.sm },
});
