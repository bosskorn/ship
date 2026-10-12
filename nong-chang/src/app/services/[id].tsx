import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceGraphic } from '@/brand/ServiceGraphic';
import { NAppBar, NAvatar, NBottomBar, NButton, NEmpty, NIcon, NIconButton, NRating, NScreen, NText, type IconName } from '@/components';
import { categoryById, serviceById } from '@/data/catalog';
import { track } from '@/lib/analytics';
import { formatBaht, formatRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

const PROCESS = [
  { title: 'เรียกหรือนัดช่าง', body: 'เห็นราคาก่อนยืนยัน' },
  { title: 'ช่างถึงหน้างาน', body: 'ยืนยันตัวช่างด้วยรหัส PIN' },
  { title: 'ทำงานตามรายการ', body: 'งานเพิ่มต้องได้รับอนุมัติจากคุณก่อน' },
  { title: 'ตรวจงานแล้วชำระ', body: 'ชำระผ่านแอป พร้อมรับประกัน' },
];

export default function ServiceDetail() {
  const { id, asap } = useLocalSearchParams<{ id: string; asap?: string }>();
  const service = serviceById(id);
  const { state, setDraft } = useApp();
  const insets = useSafeAreaInsets();

  if (!service) {
    return (
      <NScreen scroll={false}>
        <NAppBar />
        <NEmpty title="ไม่พบบริการนี้" description="บริการอาจปิดให้บริการชั่วคราว" />
      </NScreen>
    );
  }

  const qty = state.draft.serviceId === service.id ? state.draft.quantity : 1;
  const fixed = service.pricing === 'fixed';
  const perUnit = fixed && service.unit === 'เครื่อง';
  const total = fixed ? service.price * qty : service.price;
  const category = categoryById(service.categoryId);

  const book = (mode: 'asap' | 'scheduled') => {
    setDraft({ serviceId: service.id, quantity: qty, schedule: mode === 'asap' ? { mode: 'asap' } : { mode: 'scheduled' } });
    track('start_booking', { serviceId: service.id, mode });
    router.push(mode === 'asap' ? '/booking/summary' : '/booking/schedule');
  };
  const setQty = (n: number) => {
    haptic.select();
    setDraft({ serviceId: service.id, quantity: Math.min(10, Math.max(1, n)) });
  };

  const trust: { icon: IconName; title: string; sub: string }[] = [
    { icon: 'verified', title: 'ช่างยืนยันตัวตน', sub: 'ผ่าน KYC ทุกคน' },
    { icon: 'receipt', title: fixed ? 'ราคาคงที่' : 'อนุมัติก่อนซ่อม', sub: fixed ? 'ไม่มีบวกเพิ่ม' : 'ไม่มีค่าใช้จ่ายแอบแฝง' },
    { icon: 'shield', title: `รับประกัน ${service.warrantyDays} วัน`, sub: 'แจ้งปัญหาในแอป' },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        {/* Hero — service illustration on the brand tint */}
        <View style={[styles.hero, { paddingTop: insets.top + 48 }]}>
          <ServiceGraphic category={service.categoryId} size={148} tile={false} />
          <View style={styles.heroTag}>
            <NText variant="label" color="primary">
              {category?.name}
            </NText>
          </View>
        </View>

        {/* Main info sheet overlaps the hero */}
        <View style={styles.sheet}>
          <NText variant="h1">{service.name}</NText>
          {service.rating ? (
            <View style={styles.inline}>
              <NRating value={service.rating} size={14} />
              <NText variant="secondaryStrong">{service.rating.toFixed(1)}</NText>
              <NText variant="secondary" color="textSecondary">
                · {formatBaht(service.reviews ?? 0)} รีวิว
              </NText>
            </View>
          ) : null}

          <View style={styles.priceBlock}>
            <View style={{ gap: 2 }}>
              <NText variant="caption" color="textSecondary">
                {fixed ? `ราคาต่อ${service.unit}` : 'ค่าตรวจหน้างาน'}
              </NText>
              <View style={styles.priceRow}>
                <NText variant="display" color="primary">
                  {formatBaht(service.price)}
                </NText>
                <NText variant="secondary" color="textSecondary">
                  บาท
                </NText>
              </View>
            </View>
            <View style={styles.duration}>
              <NIcon name="clock" size={16} color={color.textSecondary} />
              <NText variant="secondaryStrong" color="textSecondary">
                {formatRange(service.durationMin, service.durationMax, 'นาที')}
              </NText>
            </View>
          </View>
          {!fixed ? (
            <NText variant="secondary" color="textSecondary">
              ช่างจะตรวจหน้างานและส่งใบเสนอราคาให้คุณอนุมัติก่อนเริ่มซ่อม ค่าตรวจจะถูกหักออกเมื่ออนุมัติงาน
            </NText>
          ) : null}

          <View style={styles.trust}>
            {trust.map((t) => (
              <View key={t.title} style={styles.trustItem}>
                <View style={styles.trustIcon}>
                  <NIcon name={t.icon} size={20} color={color.primary} />
                </View>
                <NText variant="label" align="center">
                  {t.title}
                </NText>
                <NText variant="caption" color="textSecondary" align="center" style={{ fontSize: 11, lineHeight: 15 }}>
                  {t.sub}
                </NText>
              </View>
            ))}
          </View>
        </View>

        {perUnit ? (
          <View style={[styles.card, styles.qty]}>
            <View style={{ flex: 1 }}>
              <NText variant="bodyStrong">จำนวน{service.unit}</NText>
              <NText variant="caption" color="textSecondary">
                รวม {formatBaht(total)} บาท
              </NText>
            </View>
            <NIconButton icon="minus" bordered accessibilityLabel="ลดจำนวน" onPress={() => setQty(qty - 1)} />
            <NText variant="h2" style={styles.qtyValue}>
              {qty}
            </NText>
            <NIconButton icon="plus" bordered accessibilityLabel="เพิ่มจำนวน" onPress={() => setQty(qty + 1)} />
          </View>
        ) : null}

        <View style={styles.card}>
          <NText variant="h3">รวมในบริการ</NText>
          <View style={styles.included}>
            {service.included.map((i) => (
              <View key={i} style={styles.includedItem}>
                <View style={styles.check}>
                  <NIcon name="check" size={12} color={color.textOnPrimary} strokeWidth={3} />
                </View>
                <NText variant="secondary" style={{ flex: 1 }}>
                  {i}
                </NText>
              </View>
            ))}
          </View>
          <View style={styles.notIncluded}>
            <NText variant="caption" color="textSecondary">
              ไม่รวม: {service.notIncluded.join(' · ')}
            </NText>
          </View>
        </View>

        <View style={styles.card}>
          <NText variant="h3">ขั้นตอนการใช้บริการ</NText>
          <View style={{ gap: space.sm }}>
            {PROCESS.map((p, i) => (
              <View key={p.title} style={styles.processRow}>
                <View style={styles.processNum}>
                  <NText variant="label" color="primary">
                    {i + 1}
                  </NText>
                </View>
                <View style={{ flex: 1 }}>
                  <NText variant="secondaryStrong">{p.title}</NText>
                  <NText variant="caption" color="textSecondary">
                    {p.body}
                  </NText>
                </View>
              </View>
            ))}
          </View>
        </View>

        {service.rating ? (
          <View style={styles.card}>
            <View style={styles.between}>
              <NText variant="h3">รีวิวล่าสุด</NText>
              <NText variant="secondaryStrong" color="primary">
                ดูทั้งหมด
              </NText>
            </View>
            <View style={styles.review}>
              <NAvatar size={36} tone="neutral" initials="ลูกค้า" />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.between}>
                  <NText variant="secondaryStrong">คุณพ. · ลาดพร้าว</NText>
                  <NRating value={5} size={12} />
                </View>
                <NText variant="secondary" color="textSecondary">
                  ช่างมาตรงเวลา ล้างละเอียด ปูผ้ากันเปื้อนให้ด้วย แอร์เย็นขึ้นชัดเจน
                </NText>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Floating app bar over the hero */}
      <View style={[styles.bar, { paddingTop: insets.top + space.xxs }]} pointerEvents="box-none">
        <NIconButton icon="back" bordered accessibilityLabel="ย้อนกลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>

      <NBottomBar>
        <NButton theme="default" onPress={() => book('scheduled')} style={{ flex: 1 }}>
          นัดหมาย
        </NButton>
        <NButton theme="primary" haptics icon="bolt" onPress={() => book('asap')} style={{ flex: 2 }}>
          {asap === '1' || !fixed ? 'เรียกตอนนี้' : `จอง ${formatBaht(total)} บาท`}
        </NButton>
      </NBottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  bar: { position: 'absolute', top: 0, left: layout.screenPadding, right: layout.screenPadding },
  hero: { backgroundColor: color.graphicTint, alignItems: 'center', paddingBottom: space.xxl + space.md },
  heroTag: { position: 'absolute', right: layout.screenPadding, bottom: space.xxl + space.lg, backgroundColor: color.bgContainer, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  sheet: {
    marginTop: -space.xl,
    backgroundColor: color.bgContainer,
    borderTopLeftRadius: radius.dialog * 1.5,
    borderTopRightRadius: radius.dialog * 1.5,
    padding: layout.screenPadding,
    paddingTop: space.lg,
    gap: space.sm,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceBlock: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.xxs },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color.bgSecondary, borderRadius: radius.pill, paddingHorizontal: space.sm, height: 30, marginBottom: 6 },
  trust: { flexDirection: 'row', marginTop: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  trustItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  trustIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  card: { backgroundColor: color.bgContainer, marginTop: space.xs, padding: layout.screenPadding, gap: space.sm },
  qty: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qtyValue: { minWidth: 32, textAlign: 'center' },
  included: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  includedItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.success, alignItems: 'center', justifyContent: 'center' },
  notIncluded: { backgroundColor: color.bgSecondary, borderRadius: radius.card, padding: space.sm },
  processRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  processNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.primaryLight, alignItems: 'center', justifyContent: 'center' },
  review: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
