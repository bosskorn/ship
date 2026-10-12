import { router, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  NBadge,
  NButton,
  NDivider,
  NFadeIn,
  NIcon,
  NIconButton,
  NJobStatus,
  NOfflineBanner,
  NSearch,
  NSection,
  NServiceItem,
  NSkeleton,
  NText,
  NScreen,
} from '@/components';
import { CATEGORIES, QUICK_CATEGORIES, SERVICES, serviceById } from '@/data/catalog';
import { TECHNICIANS } from '@/data/technicians';
import { estimateEta } from '@/domain/dispatch';
import { track } from '@/lib/analytics';
import { useIsOffline } from '@/lib/network';
import { useApp, useTechnician, type Job } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { state, activeJob } = useApp();
  const offline = useIsOffline();
  const [loaded, setLoaded] = useState(false);

  // UI shell renders immediately; content crossfades in over skeletons (spec §14).
  useEffect(() => {
    if (state.booting) return;
    const t = setTimeout(() => setLoaded(true), 450);
    return () => clearTimeout(t);
  }, [state.booting]);

  const unread = state.notifications.filter((n) => !n.read).length;
  const online = useMemo(() => TECHNICIANS.filter((t) => t.online && !t.busy), []);
  const fastest = useMemo(() => Math.min(...online.map((t) => estimateEta(t.distanceKm))), [online]);
  const recommended = SERVICES.filter((s) => s.recommended);
  const address = state.draft.address;

  return (
    <View style={styles.root}>
      {/* Header — location + notifications */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <Pressable accessibilityRole="button" style={styles.location} onPress={() => router.push('/booking/address')}>
          <NIcon name="location" size={20} color={color.primary} />
          <View style={{ flex: 1 }}>
            <View style={styles.inline}>
              <NText variant="bodyStrong">{address.label}</NText>
              <NIcon name="chevron-down" size={16} color={color.textSecondary} />
            </View>
            <NText variant="caption" color="textSecondary" numberOfLines={1}>
              {address.district}
            </NText>
          </View>
        </Pressable>
        <NIconButton icon="bell" accessibilityLabel="การแจ้งเตือน" onPress={() => router.push('/notifications')} badge={unread ? <NBadge dot /> : undefined} />
      </View>
      {offline ? <NOfflineBanner lastSyncedAt={state.lastSyncedAt} /> : null}

      <NScreen>
        <View style={styles.hero}>
          <NText variant="h1">ต้องการให้เราช่วยเรื่องอะไร?</NText>
          <NSearch onPress={() => router.push('/search')} onCameraPress={() => router.push('/diagnosis')} />
        </View>

        {/* Active job is always pushed to the top (spec §21) */}
        {activeJob ? <ActiveJob job={activeJob} /> : null}

        <NSection
          title="บริการ"
          action={
            <NButton theme="text" size="small" onPress={() => router.push('/services')}>
              ดูทั้งหมด
            </NButton>
          }
        >
          {loaded ? (
            <NFadeIn style={styles.grid}>
              {QUICK_CATEGORIES.map((id) => {
                const cat = CATEGORIES.find((c) => c.id === id)!;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !cat.available }}
                    onPress={() => router.push({ pathname: '/services', params: { category: id } })}
                    style={({ pressed }) => [styles.tile, pressed && { backgroundColor: color.bgSecondary }]}
                  >
                    <NText variant="bodyStrong" color={cat.available ? 'textPrimary' : 'textSecondary'}>
                      {cat.shortName}
                    </NText>
                    {!cat.available ? (
                      <NText variant="caption" color="textPlaceholder">
                        เร็ว ๆ นี้
                      </NText>
                    ) : null}
                  </Pressable>
                );
              })}
            </NFadeIn>
          ) : (
            <View style={styles.grid}>
              {QUICK_CATEGORIES.map((id) => (
                <NSkeleton key={id} width="31.5%" height={64} radius={radius.card} />
              ))}
            </View>
          )}
        </NSection>

        {/* Call now — the single primary CTA of Home (spec §19) */}
        {!activeJob ? (
          <NSection>
            <View style={styles.now}>
              <View style={{ gap: space.xxs }}>
                <NText variant="h3">ต้องการช่างตอนนี้?</NText>
                {loaded ? (
                  <View style={styles.inline}>
                    <View style={styles.liveDot} />
                    <NText variant="secondary" color="textSecondary">
                      ช่างออนไลน์ใกล้คุณ {online.length} คน · เร็วที่สุด {fastest} นาที
                    </NText>
                  </View>
                ) : (
                  <NSkeleton width="70%" height={14} />
                )}
              </View>
              <NButton
                theme="primary"
                block
                haptics
                onPress={() => {
                  track('start_booking', { source: 'call_now' });
                  router.push({ pathname: '/services', params: { asap: '1' } });
                }}
              >
                เรียกช่างตอนนี้
              </NButton>
            </View>
          </NSection>
        ) : null}

        <NSection title="บริการแนะนำ" flush>
          {loaded ? (
            <NFadeIn>
              <View style={styles.list}>
                {recommended.map((s, i) => (
                  <NServiceItem
                    key={s.id}
                    service={s}
                    divider={i < recommended.length - 1}
                    onPress={() => router.push(`/services/${s.id}`)}
                    action={
                      <NButton theme="outline" size="small" onPress={() => router.push(`/services/${s.id}`)}>
                        เลือกบริการ
                      </NButton>
                    }
                  />
                ))}
              </View>
            </NFadeIn>
          ) : (
            <View style={[styles.list, { padding: layout.screenPadding, gap: space.md }]}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ gap: space.xs }}>
                  <NSkeleton width="50%" />
                  <NSkeleton width="35%" height={12} />
                  <NSkeleton width="20%" height={14} />
                </View>
              ))}
            </View>
          )}
        </NSection>
      </NScreen>
    </View>
  );
}

function ActiveJob({ job }: { job: Job }) {
  const service = serviceById(job.serviceId);
  const tech = useTechnician(job.technicianId);
  const target: Href = job.status === 'matching' ? `/job/${job.id}/matching` : job.status === 'quoted' ? `/job/${job.id}/quote` : `/job/${job.id}/tracking`;
  const headline =
    job.status === 'matching'
      ? 'น้องช่างกำลังค้นหาช่างใกล้คุณ'
      : job.status === 'en_route'
        ? 'ช่างกำลังเดินทาง'
        : job.status === 'arrived'
          ? 'ช่างมาถึงแล้ว'
          : job.status === 'quoted'
            ? 'มีใบเสนอราคารออนุมัติ'
            : job.status === 'completed'
              ? 'งานเสร็จเรียบร้อย'
              : 'งานกำลังดำเนินการ';
  return (
    <NSection>
      <View style={styles.active}>
        <View style={styles.activeTop}>
          <NText variant="h3" style={{ flex: 1 }}>
            {headline}
          </NText>
          <NJobStatus status={job.status} />
        </View>
        <NText variant="secondary" color="textSecondary">
          {service?.name} {job.quantity > 1 ? `${job.quantity} ${service?.unit}` : `1 ${service?.unit}`}
          {tech ? ` · ${tech.name}` : ''}
        </NText>
        {job.status === 'en_route' && job.etaMinutes !== undefined ? (
          <NText variant="bodyStrong" color="primary">
            ถึงประมาณ {job.etaMinutes} นาที
          </NText>
        ) : null}
        <NDivider style={{ marginVertical: space.xs }} />
        <NButton theme="primary" block size="medium" onPress={() => router.push(target)}>
          {job.status === 'quoted' ? 'ตรวจสอบราคา' : job.status === 'completed' ? 'ตรวจงานและยืนยัน' : 'ติดตามช่าง'}
        </NButton>
      </View>
    </NSection>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xs,
    backgroundColor: color.bgContainer,
    gap: space.sm,
  },
  location: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  hero: { backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, justifyContent: 'space-between' },
  tile: {
    width: '31.5%',
    height: 64,
    borderRadius: radius.card,
    backgroundColor: color.bgContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  now: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.success },
  list: { backgroundColor: color.bgContainer },
  active: {
    backgroundColor: color.bgContainer,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.primaryLightBorder,
    padding: space.md,
    gap: space.xxs,
  },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
