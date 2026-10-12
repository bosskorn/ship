import { Feather } from '@expo/vector-icons';
import { ApiError, BottomBar, Button, Cell, color, Field, font, km, minutes, Money, Section, space, statusText, statusTone, Tag, timeHM } from '@ship/mobile-ui';
import { CUSTOMER_CANCELLABLE, DriverLocationPayload, OrderStatus, OrderView, PAYMENT_METHOD_TH, TimelineEvent, VEHICLE_TH, WsEvent } from '@ship/shared';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../../lib/api';

const HEADLINE: Partial<Record<OrderStatus, string>> = {
  PAYMENT_PENDING: 'รอการชำระเงิน',
  SCHEDULED: 'จองล่วงหน้าแล้ว ระบบจะเริ่มหาคนขับก่อนเวลานัด',
  SEARCHING_DRIVER: 'กำลังหาคนขับที่เหมาะสมที่สุด',
  NO_DRIVER: 'ยังไม่พบคนขับ ทีมงานกำลังช่วยจัดหาให้',
  DRIVER_ASSIGNED: 'ได้คนขับแล้ว',
  GOING_TO_PICKUP: 'คนขับกำลังไปจุดรับสินค้า',
  ARRIVED_PICKUP: 'คนขับถึงจุดรับแล้ว แจ้งรหัสรับสินค้าให้คนขับ',
  PICKED_UP: 'คนขับรับสินค้าแล้ว',
  IN_TRANSIT: 'กำลังนำส่งสินค้า',
  ARRIVED_DESTINATION: 'คนขับถึงจุดส่งแล้ว ผู้รับแจ้งรหัสยืนยันให้คนขับ',
  DELIVERED: 'ส่งสำเร็จ',
  CANCELLED: 'ออเดอร์ถูกยกเลิก',
};

export default function Tracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nav = useNavigation();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [payment, setPayment] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    const [o, t, tr, p] = await Promise.all([
      api.get<OrderView>(`/orders/${id}`),
      api.get<TimelineEvent[]>(`/orders/${id}/timeline`),
      api.get(`/orders/${id}/tracking`),
      api.get(`/orders/${id}/payment`).catch(() => null),
    ]);
    setOrder(o);
    setTimeline(t);
    setPayment(p);
    if (tr.driverLocation) setDriverPos({ lat: tr.driverLocation.lat, lng: tr.driverLocation.lng });
    if (tr.etaSeconds) setEta(tr.etaSeconds);
  }, [id]);

  useEffect(() => {
    nav.setOptions({ title: order?.orderNo ?? 'ติดตามการส่ง' });
  }, [nav, order?.orderNo]);

  // realtime: status changes + driver GPS (spec §21)
  useEffect(() => {
    void load();
    const s = api.realtime();
    const subscribe = () => s.emit(WsEvent.SUBSCRIBE_ORDER, { orderId: id });
    subscribe();
    s.on('connect', subscribe);
    const onUpdate = (e: { orderId: string }) => e.orderId === id && void load();
    const onLoc = (p: DriverLocationPayload) => {
      if (p.orderId !== id) return;
      setDriverPos({ lat: p.lat, lng: p.lng });
      if (p.etaSeconds != null) setEta(p.etaSeconds);
    };
    s.on(WsEvent.ORDER_UPDATED, onUpdate);
    s.on(WsEvent.DRIVER_LOCATION, onLoc);
    return () => {
      s.emit(WsEvent.UNSUBSCRIBE_ORDER, { orderId: id });
      s.off('connect', subscribe);
      s.off(WsEvent.ORDER_UPDATED, onUpdate);
      s.off(WsEvent.DRIVER_LOCATION, onLoc);
    };
  }, [id, load]);

  const points = useMemo(() => {
    if (!order) return [];
    const p = order.stops.map((s) => ({ latitude: s.location.lat, longitude: s.location.lng }));
    if (driverPos) p.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    return p;
  }, [order, driverPos]);

  useEffect(() => {
    if (points.length) mapRef.current?.fitToCoordinates(points, { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: true });
    // refit only when the set of markers changes, not on every GPS ping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status, !!driverPos]);

  if (!order) return <ActivityIndicator style={{ marginTop: space.xxl }} color={color.brand} />;

  const pickup = order.stops[0];
  const drops = order.stops.slice(1);
  const active = ['DRIVER_ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DESTINATION'].includes(order.status);
  const etaLabel = order.status === 'GOING_TO_PICKUP' ? 'ถึงจุดรับใน' : order.status === 'IN_TRANSIT' ? 'ถึงจุดส่งถัดไปใน' : null;

  const cancel = () =>
    Alert.alert('ยกเลิกออเดอร์', 'ต้องการยกเลิกออเดอร์นี้หรือไม่', [
      { text: 'ไม่ยกเลิก', style: 'cancel' },
      {
        text: 'ยกเลิกออเดอร์',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/orders/${id}/cancel`, { reason: 'ลูกค้ายกเลิกผ่านแอป' });
            await load();
          } catch (e) {
            Alert.alert('ยกเลิกไม่สำเร็จ', (e as ApiError).message);
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={{ height: 260 }}>
          <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={{ latitude: pickup.location.lat, longitude: pickup.location.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }} toolbarEnabled={false}>
            <Marker coordinate={{ latitude: pickup.location.lat, longitude: pickup.location.lng }} pinColor={color.success} title="จุดรับ" />
            {drops.map((s, i) => (
              <Marker key={s.id} coordinate={{ latitude: s.location.lat, longitude: s.location.lng }} pinColor={color.warning} title={`จุดส่ง ${drops.length > 1 ? i + 1 : ''}`} />
            ))}
            {driverPos && active && (
              <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }} anchor={{ x: 0.5, y: 0.5 }} title={order.driver?.name}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.brand, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="navigation" size={12} color="#fff" />
                </View>
              </Marker>
            )}
          </MapView>
        </View>

        <View style={{ padding: space.lg, backgroundColor: color.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Tag text={statusText(order.status)} tone={statusTone(order.status)} />
            <Text style={[font.caption, { color: color.text3 }]}>
              {order.orderNo} · {VEHICLE_TH[order.vehicleType].name} · {km(order.distanceM)}
            </Text>
          </View>
          <Text style={[font.h2, { marginTop: space.sm }]}>{HEADLINE[order.status] ?? statusText(order.status)}</Text>
          {etaLabel && eta != null && (
            <Text style={[font.body, { color: color.brand, marginTop: 2 }]}>
              {etaLabel} ~{minutes(eta)}
            </Text>
          )}
          {order.status === 'SEARCHING_DRIVER' && <ActivityIndicator style={{ alignSelf: 'flex-start', marginTop: space.sm }} color={color.brand} />}
        </View>

        {order.driver && (
          <Section title="คนขับ">
            <Cell
              left={
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.brandLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="user" size={20} color={color.brand} />
                </View>
              }
              title={`${order.driver.name}${order.driver.rating ? `  ★ ${order.driver.rating}` : ''}`}
              description={`${order.driver.vehicle.plateNumber} ${order.driver.vehicle.plateProvince} · ${[order.driver.vehicle.brand, order.driver.vehicle.model, order.driver.vehicle.color].filter(Boolean).join(' ')}`}
              value={
                order.driver.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${order.driver!.phone}`)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="phone" size={18} color={color.brand} />
                  </Pressable>
                ) : undefined
              }
              last
            />
          </Section>
        )}

        {payment?.status === 'PENDING' && payment?.method === 'QR' && (
          <Section title="ชำระเงินด้วย QR พร้อมเพย์">
            <View style={{ padding: space.lg, gap: space.sm }}>
              <Text style={[font.small, { color: color.text2 }]}>สแกน QR เพื่อชำระ ระบบจะเริ่มหาคนขับทันทีที่ชำระสำเร็จ</Text>
              <Text style={[font.caption, { fontFamily: 'Courier', color: color.text3 }]} selectable>
                {payment.client_data?.qrPayload}
              </Text>
            </View>
          </Section>
        )}

        <Section title="จุดรับ-ส่ง และรหัสยืนยัน">
          {order.stops.map((s, i) => (
            <Cell
              key={s.id}
              left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.type === 'PICKUP' ? color.success : color.warning }} />}
              title={s.address}
              description={`${s.type === 'PICKUP' ? 'รับ' : 'ส่ง'} · ${s.contactName} ${s.contactPhone}${s.completedAt ? ` · เสร็จ ${timeHM(s.completedAt)}` : ''}`}
              value={
                s.otp ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[font.caption, { color: color.text3 }]}>{s.type === 'PICKUP' ? 'รหัสรับของ' : 'รหัสผู้รับ'}</Text>
                    <Text style={[font.h2, { letterSpacing: 2, fontVariant: ['tabular-nums'] }]}>{s.otp}</Text>
                  </View>
                ) : s.status === 'COMPLETED' ? (
                  <Feather name="check-circle" size={18} color={color.success} />
                ) : undefined
              }
              last={i === order.stops.length - 1}
            />
          ))}
        </Section>
        {drops.some((s) => s.otp) && <Text style={[font.caption, { color: color.text3, paddingHorizontal: space.lg, marginTop: space.xs }]}>ส่งรหัสผู้รับให้ปลายทาง คนขับต้องใช้รหัสนี้ (หรือรูปถ่าย + ชื่อผู้รับ) เพื่อยืนยันการส่ง</Text>}

        <Section title="ชำระเงิน">
          <Cell title={PAYMENT_METHOD_TH[order.paymentMethod]} description={payment ? `สถานะ: ${payment.status}` : undefined} value={<Money satang={order.price} strong />} last />
        </Section>

        <Section title="ไทม์ไลน์">
          {timeline
            .filter((t) => t.toStatus)
            .map((t, i, arr) => (
              <Cell key={t.id} title={<Text style={font.small}>{statusText(t.toStatus!)}</Text>} value={<Text style={[font.caption, { color: color.text3 }]}>{timeHM(t.at)}</Text>} last={i === arr.length - 1} />
            ))}
        </Section>

        {order.status === 'DELIVERED' && !order.rating && <Rate orderId={order.id} onDone={load} />}
        {order.rating && (
          <Section title="คะแนนของคุณ">
            <Cell title={'★'.repeat(order.rating.score) + '☆'.repeat(5 - order.rating.score)} description={order.rating.comment ?? undefined} last />
          </Section>
        )}
      </ScrollView>
      {CUSTOMER_CANCELLABLE.includes(order.status) && (
        <BottomBar>
          <Button title="ยกเลิกออเดอร์" variant="outline" onPress={cancel} />
        </BottomBar>
      )}
      {order.status === 'DELIVERED' && (
        <BottomBar>
          <Button title="กลับหน้าแรก" variant="outline" onPress={() => router.replace('/(tabs)')} />
        </BottomBar>
      )}
    </View>
  );
}

function Rate({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [score, setScore] = useState(5);
  const [tip, setTip] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/rate`, { score, comment: comment || undefined, tipSatang: tip || undefined });
      onDone();
    } catch (e) {
      Alert.alert('ส่งคะแนนไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="ให้คะแนนคนขับ">
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.md, padding: space.md }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setScore(n)} hitSlop={6}>
            <Feather name="star" size={30} color={n <= score ? color.warning : color.border} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md }}>
        {[0, 2000, 4000, 10000].map((t) => (
          <Pressable key={t} onPress={() => setTip(t)} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 3, borderWidth: 1, borderColor: tip === t ? color.brand : color.border, backgroundColor: tip === t ? color.brandLight : color.surface }}>
            <Text style={[font.small, { color: tip === t ? color.brand : color.text }]}>{t ? `ทิป ฿${t / 100}` : 'ไม่ทิป'}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="ความคิดเห็น" value={comment} onChangeText={setComment} />
      <View style={{ padding: space.md }}>
        <Button title="ส่งคะแนน" onPress={submit} loading={busy} />
      </View>
    </Section>
  );
}
