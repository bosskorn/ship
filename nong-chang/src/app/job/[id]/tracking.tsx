import { router, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Linking, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HomeMarker,
  NButton,
  NDivider,
  NEmpty,
  NIcon,
  NIconButton,
  NJobStatus,
  NMap,
  NOfflineBanner,
  NSteps,
  NTechnicianItem,
  NText,
  StepItem,
} from '@/components';
import { serviceById } from '@/data/catalog';
import { hasReached, JobStatus, TRACKING_STEPS } from '@/domain/job';
import { formatTime } from '@/lib/format';
import { useIsOffline } from '@/lib/network';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, elevation, layout, radius, space } from '@/theme/tokens';

export default function Tracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { confirmArrival, state } = useApp();
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const map = useRef<MapView>(null);

  // Next-screen routing for statuses that have their own page.
  const nextHref = useMemo<Href | undefined>(() => {
    if (!job) return undefined;
    const map: Partial<Record<JobStatus, Href>> = {
      quoted: `/job/${job.id}/quote`,
      approved: `/job/${job.id}/progress`,
      in_progress: `/job/${job.id}/progress`,
      completed: `/job/${job.id}/complete`,
      confirmed: `/job/${job.id}/payment`,
    };
    return map[job.status];
  }, [job]);

  const status = job?.status;
  useEffect(() => {
    // Auto-advance when the technician sends a quote: approval is blocking.
    if (status === 'quoted' && nextHref) router.push(nextHref);
  }, [status, nextHref]);

  if (!job || !tech) {
    return <NEmpty title="ไม่พบข้อมูลการติดตาม" action={<NButton theme="outline" size="medium" onPress={() => router.replace('/')}>กลับหน้าแรก</NButton>} />;
  }

  const service = serviceById(job.serviceId);
  const home = { latitude: job.address.lat, longitude: job.address.lng };
  const start = { latitude: home.latitude + tech.offset.lat, longitude: home.longitude + tech.offset.lng };
  const p = hasReached(job.status, 'arrived') ? 1 : job.routeProgress;
  const techPos = { latitude: start.latitude + (home.latitude - start.latitude) * p, longitude: start.longitude + (home.longitude - start.longitude) * p };
  const arrived = job.status === 'arrived';
  const inspecting = job.status === 'started';

  const steps: StepItem[] = TRACKING_STEPS.map((s, i) => {
    const reached = hasReached(job.status, s.status);
    const nextReached = i < TRACKING_STEPS.length - 1 && hasReached(job.status, TRACKING_STEPS[i + 1].status);
    const ev = job.events.find((e) => e.status === s.status);
    return {
      key: s.status,
      title: s.label,
      description: ev ? formatTime(new Date(ev.at)) : undefined,
      state: reached ? (nextReached || s.status === 'completed' ? 'done' : 'current') : 'pending',
    };
  });

  const headline = arrived
    ? `ช่าง${tech.name.split(' ')[0]}มาถึงสถานที่แล้ว`
    : inspecting
      ? 'ช่างกำลังตรวจหน้างาน'
      : job.status === 'matched'
        ? 'ช่างกำลังเตรียมออกเดินทาง'
        : job.status === 'en_route'
          ? 'ช่างกำลังเดินทางไปหาคุณ'
          : undefined;

  return (
    <View style={styles.root}>
      {/* Map: ~60% of the screen (spec §30) */}
      <View style={{ height: height * 0.6 }}>
        <NMap
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: (home.latitude + start.latitude) / 2,
            longitude: (home.longitude + start.longitude) / 2,
            latitudeDelta: Math.abs(tech.offset.lat) * 2.6 + 0.01,
            longitudeDelta: Math.abs(tech.offset.lng) * 2.6 + 0.01,
          }}
          mapPadding={{ top: insets.top + 56, right: 0, bottom: 24, left: 0 }}
        >
          <Polyline coordinates={[techPos, home]} strokeColor={color.primary} strokeWidth={4} lineDashPattern={arrived ? undefined : [1]} />
          <Marker coordinate={home} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <HomeMarker />
          </Marker>
          <Marker coordinate={techPos} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[styles.techMarker, elevation.floating]}>
              <NIcon name="navigation" size={18} color={color.textOnPrimary} strokeWidth={2} />
            </View>
          </Marker>
        </NMap>
        <View style={[styles.topBar, { paddingTop: insets.top + space.xs }]}>
          <NIconButton icon="back" bordered accessibilityLabel="ย้อนกลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <NIconButton icon="help" bordered accessibilityLabel="ช่วยเหลือ" onPress={() => router.push('/support')} />
        </View>
        {job.status === 'en_route' && job.etaMinutes !== undefined ? (
          <View style={[styles.eta, elevation.floating]}>
            <NText variant="caption" color="textSecondary">
              ถึงประมาณ
            </NText>
            <NText variant="h1" color="primary">
              {job.etaMinutes} นาที
            </NText>
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, elevation.sheet]}>
        {offline ? <NOfflineBanner lastSyncedAt={state.lastSyncedAt} /> : null}
        <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.headRow}>
            <NText variant="h3" style={{ flex: 1 }}>
              {headline ?? service?.name}
            </NText>
            <NJobStatus status={job.status} />
          </View>

          {arrived ? (
            <View style={styles.pin}>
              <NText variant="secondary" color="textSecondary">
                แจ้งรหัสนี้กับช่างเพื่อเริ่มงาน
              </NText>
              <NText style={styles.pinText} accessibilityLabel={`รหัส ${job.pin.split('').join(' ')}`}>
                {job.pin}
              </NText>
            </View>
          ) : null}

          <NTechnicianItem
            technician={tech}
            compact
            onCall={() => Linking.openURL(`tel:${tech.phone}`)}
            onChat={() => router.push(`/chat/${job.id}`)}
          />
          <NDivider />
          <NSteps items={steps} compact />

          {arrived ? (
            <NButton theme="primary" block haptics onPress={() => confirmArrival(job.id)}>
              ยืนยันพบช่าง
            </NButton>
          ) : nextHref ? (
            <NButton theme="primary" block onPress={() => router.push(nextHref)}>
              {job.status === 'completed' ? 'ตรวจงานและยืนยัน' : job.status === 'confirmed' ? 'ชำระเงิน' : 'ดูความคืบหน้า'}
            </NButton>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgContainer },
  topBar: { position: 'absolute', top: 0, left: layout.screenPadding, right: layout.screenPadding, flexDirection: 'row', justifyContent: 'space-between' },
  eta: { position: 'absolute', left: layout.screenPadding, bottom: space.xl, backgroundColor: color.bgElevated, borderRadius: radius.card, paddingHorizontal: space.md, paddingVertical: space.xs },
  techMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.primary, borderWidth: 2, borderColor: color.bgContainer, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, marginTop: -radius.sheet, backgroundColor: color.bgElevated, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pin: { backgroundColor: color.primaryLight, borderRadius: radius.card, padding: space.md, alignItems: 'center', gap: space.xxs },
  pinText: { fontSize: 32, lineHeight: 40, letterSpacing: 12, fontWeight: '600', color: color.primary, fontVariant: ['tabular-nums'] },
});
