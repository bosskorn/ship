import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NEmpty, NIcon, NIconButton, NPrice, NScreen, NSection, NTag, NText } from '@/components';
import { categoryById, serviceById } from '@/data/catalog';
import { formatRange } from '@/lib/format';
import { track } from '@/lib/analytics';
import { useApp } from '@/store/AppStore';
import { color, layout, space } from '@/theme/tokens';

export default function ServiceDetail() {
  const { id, asap } = useLocalSearchParams<{ id: string; asap?: string }>();
  const service = serviceById(id);
  const { state, setDraft } = useApp();

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

  const book = (mode: 'asap' | 'scheduled') => {
    setDraft({ serviceId: service.id, quantity: qty, schedule: mode === 'asap' ? { mode: 'asap' } : { mode: 'scheduled' } });
    track('start_booking', { serviceId: service.id, mode });
    router.push(mode === 'asap' ? '/booking/summary' : '/booking/schedule');
  };

  return (
    <NScreen
      background="page"
      stickyHeaderIndices={[0]}
      footer={
        <NBottomBar>
          <NButton theme="default" onPress={() => book('scheduled')} style={{ flex: 1 }}>
            นัดหมาย
          </NButton>
          <NButton theme="primary" haptics onPress={() => book('asap')} style={{ flex: 2 }}>
            {asap === '1' || !fixed ? 'เรียกตอนนี้' : `จอง ${total.toLocaleString()} บาท`}
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title={categoryById(service.categoryId)?.name} />
      <View style={styles.head}>
        <NText variant="h1">{service.name}</NText>
        <View style={styles.inline}>
          {fixed ? (
            <NPrice amount={service.price} size="large" tone="primary" unit={`บาท / ${service.unit}`} />
          ) : (
            <>
              <NText variant="secondary" color="textSecondary">
                ค่าตรวจหน้างาน
              </NText>
              <NPrice amount={service.price} size="large" tone="primary" />
            </>
          )}
        </View>
        <View style={styles.inline}>
          <NIcon name="clock" size={16} color={color.textSecondary} />
          <NText variant="secondary" color="textSecondary">
            ใช้เวลาประมาณ {formatRange(service.durationMin, service.durationMax, 'นาที')}
          </NText>
        </View>
        {!fixed ? (
          <NText variant="secondary" color="textSecondary">
            ช่างจะตรวจหน้างานและส่งใบเสนอราคาให้คุณอนุมัติก่อนเริ่มซ่อม ค่าตรวจจะถูกหักออกเมื่ออนุมัติงาน
          </NText>
        ) : null}
      </View>

      {perUnit ? (
        <View style={styles.qty}>
          <NText variant="body" style={{ flex: 1 }}>
            จำนวน ({service.unit})
          </NText>
          <NIconButton icon="minus" bordered accessibilityLabel="ลดจำนวน" onPress={() => setDraft({ serviceId: service.id, quantity: Math.max(1, qty - 1) })} />
          <NText variant="h3" style={{ minWidth: 32, textAlign: 'center' }}>
            {qty}
          </NText>
          <NIconButton icon="plus" bordered accessibilityLabel="เพิ่มจำนวน" onPress={() => setDraft({ serviceId: service.id, quantity: Math.min(10, qty + 1) })} />
        </View>
      ) : null}

      <NSection title="รวมในบริการ">
        <View style={styles.block}>
          {service.included.map((i) => (
            <View key={i} style={styles.bullet}>
              <NIcon name="check" size={18} color={color.success} />
              <NText variant="body">{i}</NText>
            </View>
          ))}
        </View>
      </NSection>

      <NSection title="ไม่รวมในบริการ">
        <View style={styles.block}>
          {service.notIncluded.map((i) => (
            <View key={i} style={styles.bullet}>
              <NIcon name="minus" size={18} color={color.textPlaceholder} />
              <NText variant="body" color="textSecondary">
                {i}
              </NText>
            </View>
          ))}
        </View>
      </NSection>

      <NSection title="การรับประกัน">
        <View style={[styles.block, styles.inline]}>
          <NIcon name="shield" size={22} color={color.primary} />
          <View style={{ flex: 1 }}>
            <NText variant="bodyStrong">รับประกันงาน {service.warrantyDays} วัน</NText>
            <NText variant="secondary" color="textSecondary">
              มีปัญหากับงานเดิม? แจ้งน้องช่างได้เลยในแอป
            </NText>
          </View>
        </View>
      </NSection>

      <NSection>
        <View style={styles.trust}>
          <NTag tone="success">ช่างยืนยันตัวตน</NTag>
          <NTag tone="primary">ราคาแจ้งก่อนเริ่มงาน</NTag>
          <NTag>ชำระผ่านแอป</NTag>
        </View>
      </NSection>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  qty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.bgContainer,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  block: { backgroundColor: color.bgContainer, padding: space.md, borderRadius: 8, gap: space.sm },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  trust: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
