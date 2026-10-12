import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker, Polyline } from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceGraphic } from '@/brand/ServiceGraphic';
import {
  NAvatar,
  NButton,
  NEmpty,
  NIcon,
  NIconButton,
  NMap,
  NOfflineBanner,
  NStepsInline,
  NText,
} from '@/components';
import { serviceById } from '@/data/catalog';
import { hasReached } from '@/domain/job';
import { formatTime } from '@/lib/format';
import { compactSteps, jobHeadline, jobTarget } from '@/lib/jobView';
import { useIsOffline } from '@/lib/network';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, elevation, layout, radius, space } from '@/theme/tokens';

/** Live tracking (spec §30–31, directive V2 §26): map ~60%, live ETA, technician trust card. */
export default function Tracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { confirmArrival, state } = useApp();
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const map = useRef<MapView>(null);

  const status = job?.status;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const ownScreen = status === 'matched' || status === 'en_route' || status === 'arrived' || status === 'started';
  const next = useMemo(() => (job && !ownScreen ? jobTarget(job) : undefined), [job, ownScreen]);

  useEffect(() => {
    // Approval is blocking: jump straight to the quote when it arrives.
    if (status === 'quoted' && next) router.push(next);
  }, [status, next]);

  if (!job || !tech) {
    return <NEmpty title="ไม่พบข้อมูลการติดตาม" action={<NButton theme="outline" size="medium" onPress={() => router.replace('/')}>กลับหน้าแรก</NButton>} />;
  }

  const service = serviceById(job.serviceId);
  const home = { latitude: job.address.lat, longitude: job.address.lng };
  const start = { latitude: home.latitude + tech.offset.lat, longitude: home.longitude + tech.offset.lng };
  const p = hasReached(job.status, 'arrived') ? 1 : job.routeProgress;
  const techPos = { latitude: start.latitude + (home.latitude - start.latitude) * p, longitude: start.longitude + (home.longitude - start.longitude) * p };
  const arrived = job.status === 'arrived';
  const enRoute = job.status === 'en_route' || job.status === 'matched';
  const eta = job.etaMinutes ?? 0;
  const arrivalAt = new Date(now + eta * 60_000);

  return (
    <View style={styles.root}>
      <View style={{ height: height * 0.58 }}>
        <NMap
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: (home.latitude + start.latitude) / 2,
            longitude: (home.longitude + start.longitude) / 2,
            latitudeDelta: Math.abs(tech.offset.lat) * 2.6 + 0.01,
            longitudeDelta: Math.abs(tech.offset.lng) * 2.6 + 0.01,
          }}
          mapPadding={{ top: insets.top + 96, right: 0, bottom: 32, left: 0 }}
        >
          <Polyline coordinates={[start, techPos]} strokeColor={color.graphicMid} strokeWidth={5} />
          <Polyline coordinates={[techPos, home]} strokeColor={color.primary} strokeWidth={5} />
          <Marker coordinate={home} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.homePin}>
              <NIcon name="home-filled" size={16} color={color.textOnPrimary} />
            </View>
          </Marker>
          <Marker coordinate={techPos} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[styles.techMarker, elevation.floating]}>
              <NIcon name="navigation" size={18} color={color.textOnPrimary} strokeWidth={2.2} />
            </View>
          </Marker>
        </NMap>

        <View style={[styles.topBar, { paddingTop: insets.top + space.xs }]}>
          <NIconButton icon="back" bordered accessibilityLabel="ย้อนกลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          {/* Live status card */}
          <View style={[styles.etaCard, elevation.floating]}>
            <View style={styles.inline}>
              <LiveDot />
              <NText variant="label" color="primary">
                {jobHeadline(job.status)}
              </NText>
            </View>
            {enRoute ? (
              <View style={styles.etaRow}>
                <NText variant="display" color="textPrimary">
                  {eta}
                </NText>
                <NText variant="secondaryStrong" color="textSecondary">
                  นาที · ถึง {formatTime(arrivalAt)}
                </NText>
              </View>
            ) : (
              <NText variant="h3">{arrived ? 'ยืนยันพบช่างด้วยรหัส PIN' : service?.name}</NText>
            )}
          </View>
          <NIconButton icon="help" bordered accessibilityLabel="ช่วยเหลือ" onPress={() => router.push('/support')} />
        </View>
      </View>

      <View style={[styles.sheet, elevation.sheet]}>
        {offline ? <NOfflineBanner lastSyncedAt={state.lastSyncedAt} /> : null}
        <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.md }]} showsVerticalScrollIndicator={false}>
          <View style={styles.grabber} />
          <NStepsInline items={compactSteps(job.status)} />

          {arrived ? (
            <View style={styles.pin}>
              <NText variant="secondary" color="textSecondary">
                ช่าง{tech.name.split(' ')[0]}มาถึงสถานที่แล้ว · แจ้งรหัสนี้กับช่าง
              </NText>
              <View style={styles.pinRow}>
                {job.pin.split('').map((d, i) => (
                  <View key={i} style={styles.pinCell}>
                    <NText style={styles.pinText}>{d}</NText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Technician trust card */}
          <View style={styles.techCard}>
            <View style={styles.techRow}>
              <NAvatar photo={tech.photo} initials={tech.name} size={56} verified />
              <View style={{ flex: 1, gap: 2 }}>
                <NText variant="h3">{tech.name}</NText>
                <View style={styles.inline}>
                  <NIcon name="star-filled" size={14} color={color.rating} />
                  <NText variant="secondaryStrong">{tech.rating.toFixed(1)}</NText>
                  <NText variant="secondary" color="textSecondary">
                    · {tech.jobs.toLocaleString()} งาน · {tech.specialty}
                  </NText>
                </View>
              </View>
            </View>
            {tech.vehicle ? (
              <View style={styles.vehicle}>
                <NText variant="secondary" color="textSecondary">
                  {tech.vehicle.split(' · ')[0]}
                </NText>
                <View style={styles.plate}>
                  <NText variant="secondaryStrong">{tech.vehicle.split(' · ')[1]}</NText>
                </View>
              </View>
            ) : null}
            <View style={styles.contact}>
              <NButton theme="default" icon="phone" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${tech.phone}`)}>
                โทร
              </NButton>
              <NButton theme="default" icon="chat" style={{ flex: 1 }} onPress={() => router.push(`/chat/${job.id}`)}>
                ข้อความ
              </NButton>
            </View>
          </View>

          <View style={styles.jobRow}>
            <ServiceGraphic category={service?.categoryId ?? 'aircon'} size={40} />
            <View style={{ flex: 1 }}>
              <NText variant="secondaryStrong">
                {service?.name} · {job.quantity} {service?.unit}
              </NText>
              <NText variant="caption" color="textSecondary" numberOfLines={1}>
                {job.address.label} · {job.address.line}
              </NText>
            </View>
            <NText variant="caption" color="textSecondary">
              {job.id}
            </NText>
          </View>

          {arrived ? (
            <NButton theme="primary" block haptics onPress={() => confirmArrival(job.id)}>
              ยืนยันพบช่าง
            </NButton>
          ) : next ? (
            <NButton theme="primary" block onPress={() => router.push(next)}>
              {job.status === 'completed' ? 'ตรวจงานและยืนยัน' : job.status === 'confirmed' ? 'ชำระเงิน' : 'ดูความคืบหน้า'}
            </NButton>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function LiveDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.25, { duration: 800 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgContainer },
  topBar: { position: 'absolute', top: 0, left: layout.screenPadding, right: layout.screenPadding, flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  etaCard: { flex: 1, backgroundColor: color.bgElevated, borderRadius: radius.dialog, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexWrap: 'wrap' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.success },
  homePin: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.primary, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  techMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.graphicDeep, borderWidth: 3, borderColor: color.bgContainer, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, marginTop: -radius.dialog * 1.5, backgroundColor: color.bgElevated, borderTopLeftRadius: radius.dialog * 1.5, borderTopRightRadius: radius.dialog * 1.5, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, marginBottom: space.xxs },
  sheetContent: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs, gap: space.md },
  pin: { backgroundColor: color.primaryLight, borderRadius: radius.card, padding: space.md, alignItems: 'center', gap: space.sm },
  pinRow: { flexDirection: 'row', gap: space.xs },
  pinCell: { width: 48, height: 56, borderRadius: radius.card, backgroundColor: color.bgContainer, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 28, lineHeight: 36, fontWeight: '600', color: color.primary },
  techCard: { borderRadius: radius.dialog, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border, padding: space.md, gap: space.sm },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  vehicle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.bgPage, borderRadius: radius.card, paddingHorizontal: space.sm, paddingVertical: space.xs },
  plate: { borderWidth: 1.5, borderColor: color.textPrimary, borderRadius: 4, paddingHorizontal: space.xs, backgroundColor: '#FFFFFF' },
  contact: { flexDirection: 'row', gap: space.sm },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
