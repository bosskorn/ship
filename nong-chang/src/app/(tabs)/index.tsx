import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandRadar } from '@/brand/BrandRadar';
import { NongChangSymbol } from '@/brand/Logo';
import { ServiceGraphic } from '@/brand/ServiceGraphic';
import {
  NAvatar,
  NBadge,
  NButton,
  NFadeIn,
  NIcon,
  NIconButton,
  NOfflineBanner,
  NPressable,
  NSearch,
  NSkeleton,
  NStepsInline,
  NText,
} from '@/components';
import { CATEGORIES, QUICK_CATEGORIES, SERVICES, serviceById, type Service } from '@/data/catalog';
import { TECHNICIANS } from '@/data/technicians';
import { USER } from '@/data/user';
import { estimateEta } from '@/domain/dispatch';
import { track } from '@/lib/analytics';
import { formatBaht, formatRange } from '@/lib/format';
import { compactSteps, jobHeadline, jobTarget } from '@/lib/jobView';
import { useIsOffline } from '@/lib/network';
import { useApp, useTechnician, type Job } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

const PROBLEMS = ['แอร์ไม่เย็น', 'น้ำรั่ว', 'ไฟไม่ติด', 'บ้านไม่สะอาด'];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { state, activeJob } = useApp();
  const offline = useIsOffline();
  const [loaded, setLoaded] = useState(false);

  // Shell renders immediately; content crossfades in over skeletons (spec §14).
  useEffect(() => {
    if (state.booting) return;
    const t = setTimeout(() => setLoaded(true), 350);
    return () => clearTimeout(t);
  }, [state.booting]);

  const unread = state.notifications.filter((n) => !n.read).length;
  const online = useMemo(() => TECHNICIANS.filter((t) => t.online && !t.busy), []);
  const fastest = useMemo(() => Math.min(...online.map((t) => estimateEta(t.distanceKm))), [online]);
  const recommended = SERVICES.filter((s) => s.recommended);
  const address = state.draft.address;
  const firstName = USER.name;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        {/* 1 — Brand header + hero share one white surface */}
        <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
          <View style={styles.header}>
            <NongChangSymbol size={36} />
            <Pressable accessibilityRole="button" accessibilityLabel="เปลี่ยนที่อยู่" style={styles.headerText} onPress={() => router.push('/booking/address')}>
              <NText variant="caption" color="textSecondary">
                สวัสดี {firstName}
              </NText>
              <View style={styles.inline}>
                <NIcon name="location" size={14} color={color.primary} strokeWidth={2} />
                <NText variant="secondaryStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {address.label} · {address.district}
                </NText>
                <NIcon name="chevron-down" size={14} color={color.textSecondary} />
              </View>
            </Pressable>
            <NIconButton icon="bell" accessibilityLabel="การแจ้งเตือน" onPress={() => router.push('/notifications')} badge={unread ? <NBadge dot /> : undefined} />
          </View>

          {/* 2 — Hero: the question is the loudest line on the screen */}
          <View style={styles.hero}>
            <NText variant="secondary" color="textSecondary">
              วันนี้ให้น้องช่าง
            </NText>
            <NText variant="hero">ช่วยอะไรดี?</NText>
          </View>
          <NSearch
            placeholder="ค้นหา เช่น แอร์ไม่เย็น น้ำรั่ว ไฟเสีย"
            onPress={() => router.push('/search')}
            onCameraPress={() => router.push('/diagnosis')}
          />

          {/* 3 — Quick problem chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
            {PROBLEMS.map((p) => (
              <NPressable
                key={p}
                scaleTo={0.96}
                style={styles.chip}
                onPress={() => {
                  track('search_service', { query: p, source: 'home_chip' });
                  router.push({ pathname: '/search', params: { q: p } });
                }}
              >
                <NText variant="secondaryStrong" color="primary">
                  {p}
                </NText>
              </NPressable>
            ))}
          </ScrollView>
        </View>
        {offline ? <NOfflineBanner lastSyncedAt={state.lastSyncedAt} /> : null}

        {/* Active job is pushed to the top whenever there is one (spec §21) */}
        {activeJob ? <ActiveJob job={activeJob} /> : null}

        {/* 4 — Graphic service grid */}
        <View style={styles.section}>
          <SectionTitle title="บริการ" action="ดูทั้งหมด" onAction={() => router.push('/services')} />
          <View style={styles.grid}>
            {QUICK_CATEGORIES.map((id) => {
              const cat = CATEGORIES.find((c) => c.id === id)!;
              return loaded ? (
                <NFadeIn key={id} style={styles.gridCell}>
                  <NPressable
                    style={styles.gridItem}
                    accessibilityLabel={cat.available ? cat.shortName : `${cat.shortName} เร็ว ๆ นี้`}
                    onPress={() => router.push({ pathname: '/services', params: { category: id } })}
                  >
                    <View>
                      <ServiceGraphic category={id} size={60} muted={!cat.available} />
                      {!cat.available ? (
                        <View style={styles.soon}>
                          <NText variant="label" style={styles.soonText}>
                            เร็ว ๆ นี้
                          </NText>
                        </View>
                      ) : null}
                    </View>
                    <NText variant="secondaryStrong" color={cat.available ? 'textPrimary' : 'textSecondary'} numberOfLines={1}>
                      {cat.shortName}
                    </NText>
                  </NPressable>
                </NFadeIn>
              ) : (
                <View key={id} style={[styles.gridCell, styles.gridItem]}>
                  <NSkeleton width={60} height={60} radius={17} />
                  <NSkeleton width={44} height={12} />
                </View>
              );
            })}
          </View>
        </View>

        {/* 5 — Instant service: signature block (brand gradient allowed) */}
        <View style={styles.sectionPad}>
          <LinearGradient colors={[color.graphicDeep, color.primary, '#1E8BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.instant}>
            <View style={styles.instantTop}>
              <BrandRadar size={76} onDark />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.inline}>
                  <LiveDot />
                  <NText variant="label" style={styles.onDarkSoft}>
                    ช่างด่วน
                  </NText>
                </View>
                <NText variant="h2" style={styles.onDark}>
                  ต้องการช่างตอนนี้?
                </NText>
                {loaded ? (
                  <View style={styles.stats}>
                    <View>
                      <NText variant="price" style={styles.onDark}>
                        {online.length}
                        <NText variant="caption" style={styles.onDarkSoft}>
                          {' '}คน
                        </NText>
                      </NText>
                      <NText variant="caption" style={styles.onDarkSoft}>
                        ช่างออนไลน์ใกล้คุณ
                      </NText>
                    </View>
                    <View style={styles.statDivider} />
                    <View>
                      <NText variant="price" style={styles.onDark}>
                        {fastest}
                        <NText variant="caption" style={styles.onDarkSoft}>
                          {' '}นาที
                        </NText>
                      </NText>
                      <NText variant="caption" style={styles.onDarkSoft}>
                        เร็วที่สุด
                      </NText>
                    </View>
                  </View>
                ) : (
                  <NSkeleton width="80%" height={14} style={{ opacity: 0.3 }} />
                )}
              </View>
            </View>
            <NPressable
              scaleTo={0.97}
              style={styles.instantCta}
              accessibilityLabel="เรียกช่างตอนนี้"
              onPress={() => {
                track('start_booking', { source: 'call_now' });
                router.push({ pathname: '/services', params: { asap: '1' } });
              }}
            >
              <NIcon name="bolt" size={20} color={color.primary} strokeWidth={2.25} />
              <NText variant="bodyStrong" color="primary">
                เรียกช่างตอนนี้
              </NText>
            </NPressable>
          </LinearGradient>
        </View>

        {/* 6 — Recommended services with service imagery */}
        <View style={styles.section}>
          <SectionTitle title="บริการแนะนำ" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recoRow} snapToInterval={252} decelerationRate="fast">
            {recommended.map((s) => (
              <RecommendedCard key={s.id} service={s} />
            ))}
          </ScrollView>
        </View>

        {/* 7 — Product promise */}
        <View style={styles.promise}>
          {[
            { icon: 'verified' as const, text: 'ช่างยืนยันตัวตน' },
            { icon: 'receipt' as const, text: 'รู้ราคาก่อนเริ่มงาน' },
            { icon: 'shield' as const, text: 'รับประกันทุกงาน' },
          ].map((p) => (
            <View key={p.text} style={styles.promiseItem}>
              <NIcon name={p.icon} size={22} color={color.primary} />
              <NText variant="caption" color="textSecondary" align="center">
                {p.text}
              </NText>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <NText variant="h2">{title}</NText>
      {action ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction} style={styles.inline}>
          <NText variant="secondaryStrong" color="primary">
            {action}
          </NText>
          <NIcon name="chevron-right" size={16} color={color.primary} />
        </Pressable>
      ) : null}
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

function RecommendedCard({ service }: { service: Service }) {
  const open = () => {
    track('select_service', { serviceId: service.id, source: 'home_recommended' });
    router.push(`/services/${service.id}`);
  };
  return (
    <NPressable scaleTo={0.97} style={styles.reco} onPress={open} accessibilityLabel={service.name}>
      <View style={styles.recoArt}>
        <ServiceGraphic category={service.categoryId} size={88} tile={false} />
        <View style={styles.recoBadge}>
          <NIcon name="shield" size={12} color={color.success} strokeWidth={2} />
          <NText variant="label" color="success">
            รับประกัน {service.warrantyDays} วัน
          </NText>
        </View>
      </View>
      <View style={styles.recoBody}>
        <NText variant="bodyStrong" numberOfLines={1}>
          {service.name}
        </NText>
        <NText variant="secondary" color="textSecondary">
          {formatRange(service.durationMin, service.durationMax, 'นาที')}
        </NText>
        <View style={styles.recoFoot}>
          <View style={styles.priceRow}>
            <NText variant="caption" color="textSecondary">
              {service.pricing === 'inspection' ? 'ค่าตรวจ' : 'เริ่ม'}
            </NText>
            <NText variant="price">{formatBaht(service.price)}</NText>
            <NText variant="caption" color="textSecondary">
              บาท
            </NText>
          </View>
          {/* Visual affordance only — the whole card is the button (no nested pressables). */}
          <View style={styles.bookPill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <NText variant="secondaryStrong" style={styles.onDark}>
              จอง
            </NText>
          </View>
        </View>
      </View>
    </NPressable>
  );
}

function ActiveJob({ job }: { job: Job }) {
  const service = serviceById(job.serviceId);
  const tech = useTechnician(job.technicianId);
  const target = jobTarget(job);
  return (
    <View style={styles.active}>
      <View style={styles.activeHead}>
        <LiveDot />
        <NText variant="label" color="primary">
          งานกำลังดำเนินการ
        </NText>
      </View>
      <View style={styles.activeMain}>
        {tech ? <NAvatar photo={tech.photo} initials={tech.name} size={52} verified /> : <ServiceGraphic category={service?.categoryId ?? 'aircon'} size={52} />}
        <View style={{ flex: 1, gap: 2 }}>
          <NText variant="h3" color="primary">
            {jobHeadline(job.status)}
            {job.status === 'en_route' && job.etaMinutes !== undefined ? ` · ${job.etaMinutes} นาที` : ''}
          </NText>
          {tech ? (
            <View style={styles.inline}>
              <NText variant="secondaryStrong">{tech.name}</NText>
              <NIcon name="star-filled" size={13} color={color.rating} />
              <NText variant="secondary" color="textSecondary">
                {tech.rating.toFixed(1)}
              </NText>
            </View>
          ) : null}
          <NText variant="secondary" color="textSecondary" numberOfLines={1}>
            {service?.name} · {job.quantity} {service?.unit}
          </NText>
        </View>
      </View>
      <NStepsInline items={compactSteps(job.status)} />
      <View style={styles.activeActions}>
        <NButton theme="primary" style={{ flex: 1 }} onPress={() => router.push(target)}>
          ดูสถานะงาน
        </NButton>
        {tech ? (
          <>
            <NIconButton icon="phone" bordered size={48} accessibilityLabel="โทรหาช่าง" onPress={() => Linking.openURL(`tel:${tech.phone}`)} />
            <NIconButton icon="chat" bordered size={48} accessibilityLabel="ส่งข้อความถึงช่าง" onPress={() => router.push(`/chat/${job.id}`)} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  top: {
    backgroundColor: color.bgContainer,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.dialog,
    borderBottomRightRadius: radius.dialog,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  headerText: { flex: 1, gap: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  hero: { marginTop: space.md, marginBottom: space.sm },
  chipsWrap: { marginTop: space.sm, marginHorizontal: -layout.screenPadding },
  chips: { gap: space.xs, paddingHorizontal: layout.screenPadding },
  chip: {
    height: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.primaryLight,
    justifyContent: 'center',
  },
  section: { marginTop: space.md, backgroundColor: color.bgContainer, paddingVertical: space.md, borderRadius: radius.dialog, marginHorizontal: space.xs },
  sectionPad: { marginTop: space.md, paddingHorizontal: space.xs },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, marginBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, paddingHorizontal: space.xxs },
  gridCell: { width: '33.333%' },
  gridItem: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxs },
  soon: { position: 'absolute', bottom: -6, alignSelf: 'center', backgroundColor: color.bgContainer, borderRadius: radius.pill, paddingHorizontal: 6, borderWidth: 1, borderColor: color.divider },
  soonText: { fontSize: 10, lineHeight: 14, color: color.textSecondary },
  instant: { borderRadius: radius.dialog, padding: space.md, gap: space.md, overflow: 'hidden' },
  instantTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  onDark: { color: '#FFFFFF' },
  onDarkSoft: { color: 'rgba(255,255,255,0.82)' },
  instantCta: {
    height: 48,
    borderRadius: radius.button,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xxs },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.35)' },
  bookPill: { height: 32, paddingHorizontal: space.md, borderRadius: radius.button, backgroundColor: color.primary, justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.success },
  recoRow: { gap: space.sm, paddingHorizontal: space.sm },
  reco: { width: 240, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border, overflow: 'hidden', backgroundColor: color.bgContainer },
  recoArt: { height: 116, backgroundColor: color.graphicTint, alignItems: 'center', justifyContent: 'center' },
  recoBadge: {
    position: 'absolute',
    left: space.xs,
    top: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: color.bgContainer,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recoBody: { padding: space.sm, gap: 2 },
  recoFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xxs },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  active: {
    marginTop: space.md,
    marginHorizontal: space.xs,
    backgroundColor: color.bgContainer,
    borderRadius: radius.dialog,
    padding: space.md,
    gap: space.md,
    borderTopWidth: 3,
    borderTopColor: color.primary,
  },
  activeHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: -space.xs },
  activeMain: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  activeActions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  promise: { flexDirection: 'row', marginTop: space.md, marginHorizontal: space.xs, paddingVertical: space.md, gap: space.xs },
  promiseItem: { flex: 1, alignItems: 'center', gap: space.xxs },
});
