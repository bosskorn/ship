import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NCell, NEmpty, NIcon, NList, NPrice, NScreen, NSection, NTag, NText, useToast } from '@/components';
import { serviceById } from '@/data/catalog';
import { formatBaht } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { PAYMENT_LABEL, PaymentMethod, useApp, useJob } from '@/store/AppStore';
import { color, space } from '@/theme/tokens';

const METHODS: { id: PaymentMethod; description: string }[] = [
  { id: 'promptpay', description: 'สแกน QR ผ่านแอปธนาคาร' },
  { id: 'credit', description: 'Visa / Mastercard •••• 4242' },
  { id: 'debit', description: 'บัตรเดบิต' },
];

export default function Payment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const { pay } = useApp();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>(job?.paymentMethod ?? 'promptpay');
  const [paying, setPaying] = useState(false);

  if (!job) return <NEmpty title="ไม่พบงานนี้" />;
  const service = serviceById(job.serviceId);

  const submit = async () => {
    setPaying(true);
    try {
      await pay(job.id);
      router.replace(`/job/${job.id}/success`);
    } catch {
      haptic.warning();
      toast('ชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง', { theme: 'error' });
    } finally {
      setPaying(false);
    }
  };

  return (
    <NScreen
      footer={
        <NBottomBar>
          <NButton theme="primary" block haptics loading={paying} disabled={job.status !== 'confirmed'} onPress={submit}>
            {`ชำระ ${formatBaht(job.total)} บาท`}
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="ชำระเงิน" />
      <View style={styles.amount}>
        <NText variant="secondary" color="textSecondary">
          ชำระเงิน
        </NText>
        <NPrice amount={job.total} size="display" decimals />
        <NText variant="caption" color="textSecondary">
          {service?.name} · งาน {job.id}
        </NText>
      </View>

      <NSection title="วิธีชำระเงิน" flush>
        <NList>
          {METHODS.map((m) => (
            <NCell
              key={m.id}
              title={PAYMENT_LABEL[m.id]}
              description={m.description}
              right={
                <View style={[styles.radio, m.id === method && styles.radioOn]}>
                  {m.id === method ? <NIcon name="check" size={14} color={color.textOnPrimary} strokeWidth={2.5} /> : null}
                </View>
              }
              onPress={() => {
                haptic.select();
                setMethod(m.id);
              }}
            />
          ))}
          <NCell title="Wallet" description="กำลังจะเปิดให้บริการ" disabled right={<NTag size="small">เร็ว ๆ นี้</NTag>} />
        </NList>
      </NSection>
      <NText variant="caption" color="textSecondary" style={styles.secure}>
        ข้อมูลบัตรถูกเข้ารหัสและประมวลผลโดยผู้ให้บริการชำระเงินที่ได้รับอนุญาต น้องช่างไม่เก็บเลขบัตรของคุณ
      </NText>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  amount: { alignItems: 'center', gap: space.xxs, paddingVertical: space.xl, backgroundColor: color.bgContainer },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: color.primary, borderColor: color.primary },
  secure: { paddingHorizontal: space.md, marginTop: space.sm },
});
