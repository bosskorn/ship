import * as Crypto from 'expo-crypto';
import { ApiError, BottomBar, Button, Cell, color, Field, font, km, Money, Section, space } from '@ship/mobile-ui';
import { PAYMENT_METHOD_TH, QuoteBreakdown, VEHICLE_TH } from '@ship/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { quoteRequest, useDraft } from '../../lib/draft';
import { useCountdown } from '../../lib/hooks';

const LINES: [keyof QuoteBreakdown, string][] = [
  ['baseFare', 'ค่าบริการเริ่มต้น'],
  ['distanceFee', 'ค่าระยะทาง'],
  ['vehicleFee', 'ค่ารถ'],
  ['additionalStopsFee', 'จุดส่งเพิ่ม'],
  ['specialServicesFee', 'บริการเสริม'],
  ['demandAdjustment', 'ปรับตามช่วงเวลา/ความต้องการ'],
  ['trafficAdjustment', 'ปรับตามการจราจร'],
  ['minimumFareTopUp', 'ปรับเป็นค่าบริการขั้นต่ำ'],
  ['serviceFee', 'ค่าบริการแพลตฟอร์ม'],
  ['tollParking', 'ทางด่วน/ที่จอดรถ'],
];

type Method = 'CASH' | 'QR' | 'CARD';

export default function Review() {
  const { draft, update } = useDraft();
  const option = draft.options.find((o) => o.vehicleType === draft.vehicleType);
  const [method, setMethod] = useState<Method>('CASH');
  const [collectAt, setCollectAt] = useState<'PICKUP' | 'DROPOFF'>('PICKUP');
  const [promo, setPromo] = useState(draft.promoCode);
  const [busy, setBusy] = useState(false);
  // one key per confirm screen: a double tap or retry never creates two orders
  const idempotencyKey = useMemo(() => Crypto.randomUUID(), []);
  const left = useCountdown(option?.expiresAt ?? null);

  if (!option) return null;
  const b = option.breakdown;

  const applyPromo = async () => {
    setBusy(true);
    try {
      const r = await api.post('/quotes', quoteRequest(draft, draft.vehicleType!, promo));
      update({ options: draft.options.map((o) => (o.vehicleType === draft.vehicleType ? r.options[0] : o)), promoCode: promo });
      if (!r.options[0].breakdown.promotionDiscount) Alert.alert('โค้ดส่วนลด', 'โค้ดนี้ใช้กับออเดอร์นี้ไม่ได้');
    } catch (e) {
      Alert.alert('ไม่สามารถใช้โค้ดได้', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.post('/orders', { quoteId: option.quoteId, paymentMethod: method, cashCollectAt: collectAt, idempotencyKey });
      router.dismissAll();
      router.replace(`/order/${r.orderId}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'QUOTE_EXPIRED') {
        update({ options: [] });
        Alert.alert('ราคาหมดอายุ', 'กรุณาขอราคาใหม่อีกครั้ง', [{ text: 'ตกลง', onPress: () => router.back() }]);
      } else Alert.alert('สร้างออเดอร์ไม่สำเร็จ', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <Section title="สรุปงาน">
          <Cell title={draft.pickup.address} description={`รับ · ${draft.pickup.contactName} ${draft.pickup.contactPhone}`} left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.success }} />} />
          {draft.dropoffs.map((d, i) => (
            <Cell key={i} title={d.address} description={`ส่ง${draft.dropoffs.length > 1 ? ` ${i + 1}` : ''} · ${d.contactName} ${d.contactPhone}`} left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.warning }} />} />
          ))}
          <Cell title={`${VEHICLE_TH[option.vehicleType].name} · ${km(option.distanceM)}`} description={draft.scheduledAt ? `รับสินค้า ${new Date(draft.scheduledAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}` : 'ส่งทันที'} last />
        </Section>

        <Section title="ค่าบริการ">
          {LINES.filter(([k]) => b[k]).map(([k, label]) => (
            <Cell key={k} title={<Text style={[font.small, { color: color.text2 }]}>{label}</Text>} value={<Money satang={b[k]} size="small" />} />
          ))}
          {b.promotionDiscount > 0 && <Cell title={<Text style={[font.small, { color: color.success }]}>ส่วนลด {draft.promoCode}</Text>} value={<Text style={[font.small, { color: color.success }]}>-฿{(b.promotionDiscount / 100).toFixed(0)}</Text>} />}
          <Cell title={<Text style={font.bodyStrong}>รวมทั้งหมด</Text>} value={<Money satang={b.total} strong />} last />
        </Section>

        <Section title="โค้ดส่วนลด">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field label="โค้ด" value={promo} onChangeText={(v) => setPromo(v.toUpperCase())} autoCapitalize="characters" />
            </View>
            <Button title="ใช้โค้ด" variant="text" block={false} size="medium" onPress={applyPromo} disabled={!promo || busy} />
          </View>
        </Section>

        <Section title="วิธีชำระเงิน">
          {(['CASH', 'QR', 'CARD'] as Method[]).map((m, i) => (
            <Cell key={m} title={PAYMENT_METHOD_TH[m]} onPress={() => setMethod(m)} value={<Radio on={method === m} />} last={i === 2 && method !== 'CASH'} />
          ))}
          {method === 'CASH' && (
            <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md }}>
              {(['PICKUP', 'DROPOFF'] as const).map((c) => (
                <Pressable key={c} onPress={() => setCollectAt(c)} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 3, borderWidth: 1, borderColor: collectAt === c ? color.brand : color.border, backgroundColor: collectAt === c ? color.brandLight : color.surface }}>
                  <Text style={[font.small, { color: collectAt === c ? color.brand : color.text }]}>{c === 'PICKUP' ? 'เก็บเงินที่จุดรับ' : 'เก็บเงินปลายทาง'}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Section>
        <Text style={[font.caption, { color: left === 0 ? color.danger : color.text3, textAlign: 'center', marginTop: space.md }]}>
          {left === 0 ? 'ราคาหมดอายุ' : `ราคานี้มีผลอีก ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} นาที`}
        </Text>
      </ScrollView>
      <BottomBar>
        <Button title={`ยืนยันเรียกรถ · ฿${(b.total / 100).toLocaleString('th-TH')}`} onPress={confirm} loading={busy} disabled={left === 0} />
      </BottomBar>
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 1.5, borderColor: on ? color.brand : color.placeholder }} />
  );
}
