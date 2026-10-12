import { Feather } from '@expo/vector-icons';
import { ApiError, Button, color, font, km, minutes, Money, space } from '@ship/mobile-ui';
import { JobOfferPayload, VEHICLE_TH } from '@ship/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useDriver } from '../lib/driver';

/**
 * Job offer (spec §13): everything the driver needs before accepting — route, distances,
 * duration, vehicle, stops, fare, GP, bonus and net — with a countdown.
 */
export function OfferSheet() {
  const { offer, dismissOffer, reload } = useDriver();
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const total = useRef(1);

  useEffect(() => {
    if (!offer) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    total.current = Math.max(1, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) dismissOffer();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [offer, dismissOffer]);

  if (!offer) return null;

  const accept = async () => {
    setBusy('accept');
    try {
      await api.post(`/driver/offers/${offer.offerId}/accept`);
      dismissOffer();
      await reload();
      router.push('/job');
    } catch (e) {
      dismissOffer();
      Alert.alert('รับงานไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };
  const decline = async () => {
    setBusy('decline');
    await api.post(`/driver/offers/${offer.offerId}/decline`, {}).catch(() => undefined);
    setBusy(null);
    dismissOffer();
  };

  const from = offer.pickup.district || offer.pickup.address;
  const lastDrop = offer.dropoffs[offer.dropoffs.length - 1];
  const to = lastDrop?.district || lastDrop?.address;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={decline}>
      <View style={{ flex: 1, backgroundColor: color.overlay, justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.surface, paddingBottom: space.xl }}>
          <View style={{ height: 4, backgroundColor: color.divider }}>
            <View style={{ height: 4, width: `${Math.min(100, (left / total.current) * 100)}%`, backgroundColor: left <= 5 ? color.danger : color.brand }} />
          </View>
          <View style={{ padding: space.lg, gap: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[font.small, { color: color.text2 }]}>
                งานใหม่ · {VEHICLE_TH[offer.vehicleType].name}
                {offer.stopCount > 1 ? ` · ${offer.stopCount} จุดส่ง` : ''}
              </Text>
              <Text style={[font.bodyStrong, { color: left <= 5 ? color.danger : color.text, fontVariant: ['tabular-nums'] }]}>{left} วิ</Text>
            </View>

            <View>
              <Text style={font.h2} numberOfLines={1}>
                {from} → {to}
              </Text>
              <Text style={[font.small, { color: color.text3, marginTop: 2 }]} numberOfLines={2}>
                {offer.pickup.address}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: color.border, borderRadius: 3 }}>
              <Stat label="ไปจุดรับ" value={km(offer.distanceToPickupM)} />
              <Stat label="ระยะส่ง" value={km(offer.deliveryDistanceM)} />
              <Stat label="ใช้เวลาประมาณ" value={minutes(offer.estimatedDurationS)} last />
            </View>

            <View style={{ gap: 6 }}>
              <Line label="ค่ารอบ" value={<Money satang={offer.grossFare} />} />
              <Line label={`GP (${offer.commissionRateBp / 100}%)`} value={<Text style={[font.body, { color: color.danger }]}>-฿{(offer.commission / 100).toFixed(2)}</Text>} />
              {offer.bonus > 0 && <Line label="โบนัส" value={<Text style={[font.body, { color: color.success }]}>+฿{(offer.bonus / 100).toFixed(2)}</Text>} />}
              <View style={{ height: 1, backgroundColor: color.divider }} />
              <Line label={<Text style={font.bodyStrong}>คุณได้รับ</Text>} value={<Money satang={offer.netEarnings} size="number" />} />
              {offer.cashToCollect > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Feather name="dollar-sign" size={14} color={color.warning} />
                  <Text style={[font.small, { color: color.warning }]}>เก็บเงินสดจากลูกค้า ฿{(offer.cashToCollect / 100).toLocaleString('th-TH')}</Text>
                </View>
              )}
              <Text style={[font.caption, { color: color.text3 }]}>{offer.parcelSummary}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="ข้าม" variant="outline" block={false} style={{ flex: 1 }} onPress={decline} loading={busy === 'decline'} disabled={!!busy} />
              <Button title="รับงาน" block={false} style={{ flex: 2.2 }} onPress={accept} loading={busy === 'accept'} disabled={!!busy} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, padding: space.sm, borderRightWidth: last ? 0 : 1, borderRightColor: color.border }}>
      <Text style={[font.caption, { color: color.text3 }]}>{label}</Text>
      <Text style={font.bodyStrong}>{value}</Text>
    </View>
  );
}

function Line({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {typeof label === 'string' ? <Text style={[font.body, { color: color.text2 }]}>{label}</Text> : label}
      {value}
    </View>
  );
}
