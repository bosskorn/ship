import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  NAddressPicker,
  NAppBar,
  NBottomBar,
  NBottomSheet,
  NButton,
  NCell,
  NDivider,
  NEmpty,
  NIcon,
  NList,
  NPrice,
  NScreen,
  NSection,
  NText,
} from '@/components';
import { serviceById } from '@/data/catalog';
import { formatBaht, formatDayDate, formatTime } from '@/lib/format';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { PAYMENT_LABEL, PaymentMethod, priceForDraft, useApp } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

export default function OrderSummary() {
  const { state, setDraft, createJobFromDraft, resetDraft } = useApp();
  const { draft } = state;
  const service = draft.serviceId ? serviceById(draft.serviceId) : undefined;
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const confirmed = useRef(false);

  useEffect(
    () => () => {
      if (!confirmed.current) track('booking_abandon', { step: 'summary', serviceId: draft.serviceId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!service) {
    return (
      <NScreen scroll={false}>
        <NAppBar title="สรุปรายการ" />
        <NEmpty title="ยังไม่ได้เลือกบริการ" action={<NButton theme="outline" size="medium" onPress={() => router.replace('/services')}>เลือกบริการ</NButton>} />
      </NScreen>
    );
  }

  const price = priceForDraft(draft, service);
  const asap = draft.schedule.mode === 'asap';
  const when = asap ? 'เร็วที่สุด (ประมาณ 18–25 นาที)' : draft.schedule.at ? `${formatDayDate(new Date(draft.schedule.at))} · ${formatTime(new Date(draft.schedule.at))}` : 'ยังไม่ได้เลือก';

  const confirm = () => {
    setSubmitting(true);
    const job = createJobFromDraft();
    setSubmitting(false);
    if (!job) return;
    confirmed.current = true;
    haptic.select();
    resetDraft();
    // Replace the booking stack so "back" from tracking returns Home, not the form.
    router.dismissAll();
    router.push(asap ? `/job/${job.id}/matching` : `/job/${job.id}`);
  };

  return (
    <NScreen
      footer={
        <NBottomBar
          summary={
            <View style={styles.totalRow}>
              <NText variant="body" color="textSecondary">
                {service.pricing === 'inspection' ? 'ค่าตรวจหน้างาน' : 'รวม'}
              </NText>
              <NPrice amount={price.total} size="large" />
            </View>
          }
        >
          <NButton theme="primary" block haptics loading={submitting} onPress={confirm}>
            {asap ? 'ยืนยันเรียกช่าง' : 'ยืนยันนัดหมาย'}
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="สรุปรายการ" />

      <NSection title="สถานที่" flush style={{ marginTop: space.md }}>
        <NAddressPicker address={draft.address} onPress={() => router.push('/booking/address')} />
      </NSection>

      <NSection title="บริการ" flush>
        <NList>
          <NCell title={service.name} description={service.pricing === 'fixed' ? `${draft.quantity} ${service.unit}` : 'ราคาตามใบเสนอราคาหน้างาน'} />
          <NCell leftIcon="clock" title="เวลา" note={when} arrow onPress={() => router.push('/booking/schedule')} />
          <NCell leftIcon="shield" title="รับประกันงาน" note={`${service.warrantyDays} วัน`} />
        </NList>
      </NSection>

      <NSection title="รายละเอียดราคา">
        <View style={styles.block}>
          {price.lines.map((l) => (
            <View key={l.key} style={styles.line}>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'} style={{ flex: 1 }}>
                {l.kind === 'base' && service.pricing === 'fixed' ? `${service.name} × ${draft.quantity}` : l.kind === 'base' ? 'ค่าตรวจหน้างาน' : l.label}
              </NText>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'}>
                {l.amount < 0 ? '-' : ''}
                {formatBaht(Math.abs(l.amount))}
              </NText>
            </View>
          ))}
          <NDivider />
          <View style={styles.line}>
            <NText variant="bodyStrong" style={{ flex: 1 }}>
              รวม
            </NText>
            <NPrice amount={price.total} size="medium" />
          </View>
          {service.pricing === 'inspection' ? (
            <NText variant="caption" color="textSecondary">
              ค่าตรวจจะถูกหักออกจากราคาซ่อมเมื่อคุณอนุมัติใบเสนอราคา ช่างจะไม่เริ่มงานก่อนคุณอนุมัติ
            </NText>
          ) : null}
        </View>
      </NSection>

      <NSection title="ชำระเงิน" flush>
        <NList>
          <NCell title="วิธีชำระเงิน" note={PAYMENT_LABEL[draft.paymentMethod]} arrow onPress={() => setPayOpen(true)} />
          <NCell title="คูปอง" note={price.discount && draft.promoCode ? draft.promoCode : 'ไม่มี'} arrow onPress={() => setDraft({ promoCode: draft.promoCode ? undefined : 'NEWHOME' })} />
        </NList>
        <NText variant="caption" color="textSecondary" style={styles.payNote}>
          ชำระเงินหลังงานเสร็จและคุณยืนยันงานแล้วเท่านั้น
        </NText>
      </NSection>

      <NBottomSheet visible={payOpen} onClose={() => setPayOpen(false)} title="วิธีชำระเงิน">
        {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m, i, all) => (
          <NCell
            key={m}
            title={PAYMENT_LABEL[m]}
            description={m === 'promptpay' ? 'สแกน QR ผ่านแอปธนาคาร' : undefined}
            divider={i < all.length - 1}
            right={m === draft.paymentMethod ? <NIcon name="check" size={20} color={color.primary} /> : undefined}
            onPress={() => {
              haptic.select();
              setDraft({ paymentMethod: m });
              setPayOpen(false);
            }}
          />
        ))}
      </NBottomSheet>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  payNote: { paddingHorizontal: layout.screenPadding, marginTop: space.xs },
});
