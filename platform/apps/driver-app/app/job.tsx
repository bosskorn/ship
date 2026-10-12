import { Feather } from '@expo/vector-icons';
import { ApiError, BottomBar, Button, Cell, color, Field, font, km, Money, Section, space, statusText, statusTone, Tag } from '@ship/mobile-ui';
import type { OrderStatus } from '@ship/shared';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { QrScanner } from '../components/QrScanner';
import { ReasonModal } from '../components/ReasonModal';
import { SignaturePad } from '../components/SignaturePad';
import { api } from '../lib/api';
import { useDriver } from '../lib/driver';
import { currentPosition, startTracking } from '../lib/location';

type Stop = { id: string; seq: number; type: 'PICKUP' | 'DROPOFF'; status: string; address: string; building?: string | null; floor?: string | null; room?: string | null; contactName: string; contactPhone: string; note?: string | null; location: { lat: number; lng: number } };

/**
 * Delivery workflow (spec §14–16). Each button sends an intent with GPS evidence; the server
 * validates state, stop order and geofence. Nothing here changes order state locally.
 */
export default function Job() {
  useKeepAwake();
  const { reload: reloadDriver } = useDriver();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [photos, setPhotos] = useState<{ uri: string; key: string }[]>([]);
  const [recipient, setRecipient] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<null | { kind: 'geofence'; retry: (reason: string) => Promise<void>; message: string } | { kind: 'cancel' }>(null);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    const j = await api.get('/driver/orders/active').catch(() => null);
    setJob(j);
    setLoading(false);
    if (!j) {
      await reloadDriver();
      return;
    }
    await startTracking('active').catch(() => undefined);
  }, [reloadDriver]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const s = api.realtime();
    const h = () => void load();
    s.on('order:updated', h);
    return () => {
      s.off('order:updated', h);
    };
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: space.xxl }} color={color.brand} />;
  if (!job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <Feather name="check-circle" size={40} color={color.success} />
        <Text style={font.h2}>ไม่มีงานที่ต้องทำ</Text>
        <Button title="กลับหน้าหลัก" variant="outline" onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  const status = job.status as OrderStatus;
  const stops: Stop[] = job.stops;
  const pickup = stops[0];
  const nextDrop = stops.find((s) => s.type === 'DROPOFF' && s.status !== 'COMPLETED');
  const target = ['DRIVER_ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_PICKUP'].includes(status) ? pickup : nextDrop ?? pickup;
  const cashHere = job.cash && ((job.cash.collectAt === 'PICKUP' && target.type === 'PICKUP') || (job.cash.collectAt === 'DROPOFF' && target.id === stops[stops.length - 1].id));

  /** Run an intent; on OUTSIDE_GEOFENCE ask for a reason and retry with it (logged for ops). */
  const act = async (fn: (overrideReason?: string) => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      resetEvidence();
      await load();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'OUTSIDE_GEOFENCE') {
        setPrompt({
          kind: 'geofence',
          message: `${err.message} ระบบจะบันทึกเหตุผลและแจ้งทีมปฏิบัติการ`,
          retry: async (reason) => {
            setPrompt(null);
            await act(() => fn(reason));
          },
        });
      } else Alert.alert('ทำรายการไม่สำเร็จ', err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetEvidence = () => {
    setOtp('');
    setQr(null);
    setPhotos([]);
    setRecipient('');
    setSignature(null);
  };

  const takePhoto = async (purpose: 'POD') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('ต้องการสิทธิ์กล้อง');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (r.canceled) return;
    setBusy(true);
    try {
      const key = await api.uploadFile(r.assets[0].uri, purpose);
      setPhotos((p) => [...p, { uri: r.assets[0].uri, key }]);
    } catch (e) {
      Alert.alert('อัปโหลดไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const evidence = async (overrideReason?: string) => ({
    location: await currentPosition(),
    otp: otp || undefined,
    qrPayload: qr || undefined,
    photoKeys: photos.length ? photos.map((p) => p.key) : undefined,
    recipientName: recipient || undefined,
    signatureKey: signature ? await api.uploadContent(signature, 'SIGNATURE', 'image/svg+xml') : undefined,
    overrideReason,
  });

  const navigate = (s: Stop) => {
    const q = `${s.location.lat},${s.location.lng}`;
    const url = Platform.OS === 'ios' ? `maps://?daddr=${q}&dirflg=d` : `google.navigation:q=${q}`;
    void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`));
  };

  let primary: { title: string; onPress: () => void; disabled?: boolean } | null = null;
  if (status === 'DRIVER_ASSIGNED' || status === 'GOING_TO_PICKUP') {
    primary = { title: 'ถึงจุดรับแล้ว', onPress: () => act(async (r) => api.post(`/driver/orders/${job.id}/arrive-pickup`, { location: await currentPosition(), overrideReason: r })) };
  } else if (status === 'ARRIVED_PICKUP') {
    primary = {
      title: 'ยืนยันรับสินค้า',
      disabled: !(otp.length >= 4 || qr || photos.length),
      onPress: () => act(async (r) => api.post(`/driver/orders/${job.id}/pickup`, await evidence(r))),
    };
  } else if (status === 'IN_TRANSIT' && nextDrop) {
    primary = { title: `ถึงจุดส่ง${stops.length > 2 ? ` ${nextDrop.seq}` : ''}แล้ว`, onPress: () => act(async (r) => api.post(`/driver/orders/${job.id}/stops/${nextDrop.id}/arrive`, { location: await currentPosition(), overrideReason: r })) };
  } else if (status === 'ARRIVED_DESTINATION' && nextDrop) {
    primary = {
      title: 'ยืนยันส่งสำเร็จ',
      disabled: !(otp.length >= 4 || qr || (photos.length && recipient.trim())),
      onPress: () => act(async (r) => api.post(`/driver/orders/${job.id}/stops/${nextDrop.id}/complete`, await evidence(r))),
    };
  }

  const verifying = status === 'ARRIVED_PICKUP' || status === 'ARRIVED_DESTINATION';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xl }}>
        <View style={{ height: 200 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            showsUserLocation
            followsUserLocation={false}
            initialRegion={{ latitude: target.location.lat, longitude: target.location.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
            toolbarEnabled={false}
          >
            {stops.map((s) => (
              <Marker key={s.id} coordinate={{ latitude: s.location.lat, longitude: s.location.lng }} pinColor={s.type === 'PICKUP' ? color.success : color.warning} opacity={s.status === 'COMPLETED' ? 0.4 : 1} />
            ))}
          </MapView>
        </View>

        <View style={{ padding: space.lg, backgroundColor: color.surface, gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Tag text={statusText(status)} tone={statusTone(status)} />
            <Text style={[font.caption, { color: color.text3 }]}>
              {job.orderNo} · {km(job.distanceM)}
            </Text>
          </View>
          <Text style={font.h2}>{target.type === 'PICKUP' ? 'จุดรับ' : `จุดส่ง${stops.length > 2 ? ` ${target.seq}/${stops.length - 1}` : ''}`}: {target.address}</Text>
          {(target.building || target.floor || target.room) && (
            <Text style={[font.small, { color: color.text2 }]}>{[target.building, target.floor && `ชั้น ${target.floor}`, target.room && `ห้อง ${target.room}`].filter(Boolean).join(' · ')}</Text>
          )}
          {target.note && <Text style={[font.small, { color: color.warning }]}>หมายเหตุ: {target.note}</Text>}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button title="นำทาง" size="medium" block={false} style={{ flex: 1 }} variant="outline" onPress={() => navigate(target)} />
            <Button title={`โทร ${target.contactName}`} size="medium" block={false} style={{ flex: 1 }} variant="outline" onPress={() => Linking.openURL(`tel:${target.contactPhone}`)} />
          </View>
        </View>

        {cashHere && (
          <Section>
            <Cell left={<Feather name="dollar-sign" size={18} color={color.warning} />} title={<Text style={[font.bodyStrong, { color: color.warning }]}>เก็บเงินสด ฿{(job.cash.amount / 100).toLocaleString('th-TH')}</Text>} description="เก็บเงินก่อนยืนยันขั้นตอนนี้" last />
          </Section>
        )}

        {verifying && (
          <Section title={status === 'ARRIVED_PICKUP' ? 'ยืนยันการรับสินค้า' : 'หลักฐานการส่ง (POD)'}>
            <Field
              label={status === 'ARRIVED_PICKUP' ? 'รหัสรับสินค้าจากผู้ส่ง' : 'รหัสยืนยันจากผู้รับ'}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••"
            />
            <Cell title={qr ? 'สแกน QR แล้ว' : 'หรือสแกน QR จากลูกค้า'} left={<Feather name="maximize" size={18} color={qr ? color.success : color.text2} />} onPress={() => setScanOpen(true)} arrow />
            <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, alignItems: 'center' }}>
              {photos.map((p) => (
                <Image key={p.key} source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 3 }} />
              ))}
              {photos.length < 3 && (
                <Pressable onPress={() => takePhoto('POD')} style={{ width: 56, height: 56, borderWidth: 1, borderStyle: 'dashed', borderColor: color.border, alignItems: 'center', justifyContent: 'center', borderRadius: 3 }}>
                  <Feather name="camera" size={20} color={color.text3} />
                </Pressable>
              )}
              <Text style={[font.caption, { color: color.text3, flex: 1 }]}>{status === 'ARRIVED_PICKUP' ? 'ถ่ายรูปสินค้า (ใช้แทนรหัสได้)' : 'ถ่ายรูปสินค้าที่ส่งมอบ'}</Text>
            </View>
            {status === 'ARRIVED_DESTINATION' && (
              <>
                <Field label="ชื่อผู้รับ (จำเป็นเมื่อไม่มีรหัส)" value={recipient} onChangeText={setRecipient} />
                <View style={{ padding: space.md }}>
                  <SignaturePad onChange={setSignature} />
                </View>
              </>
            )}
          </Section>
        )}

        <Section title="รายได้งานนี้">
          <Cell title="ค่ารอบ" value={<Money satang={job.earnings.gross} />} />
          <Cell title="GP" value={<Text style={[font.body, { color: color.danger }]}>-฿{(job.earnings.commission / 100).toFixed(2)}</Text>} />
          {job.earnings.bonus > 0 && <Cell title="โบนัส" value={<Money satang={job.earnings.bonus} />} />}
          <Cell title={<Text style={font.bodyStrong}>คุณได้รับ</Text>} value={<Money satang={job.earnings.net} strong />} last />
        </Section>

        <Section title="จุดทั้งหมด">
          {stops.map((s, i) => (
            <Cell
              key={s.id}
              left={<Feather name={s.status === 'COMPLETED' ? 'check-circle' : 'circle'} size={16} color={s.status === 'COMPLETED' ? color.success : s.type === 'PICKUP' ? color.success : color.warning} />}
              title={s.address}
              description={`${s.type === 'PICKUP' ? 'รับ' : 'ส่ง'} · ${s.contactName}`}
              last={i === stops.length - 1}
            />
          ))}
        </Section>

        {['DRIVER_ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_PICKUP'].includes(status) && (
          <View style={{ padding: space.lg }}>
            <Button title="ยกเลิกงานนี้" variant="text" onPress={() => setPrompt({ kind: 'cancel' })} />
            <Text style={[font.caption, { color: color.text3, textAlign: 'center' }]}>การยกเลิกบ่อยมีผลต่อการได้รับงานและระดับคนขับ</Text>
          </View>
        )}
      </ScrollView>

      {primary && (
        <BottomBar>
          <Button title={primary.title} onPress={primary.onPress} disabled={primary.disabled || busy} loading={busy} />
        </BottomBar>
      )}

      <QrScanner
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={(data) => {
          setQr(data);
          setScanOpen(false);
        }}
      />
      <ReasonModal
        visible={!!prompt}
        title={prompt?.kind === 'cancel' ? 'ยกเลิกงาน' : 'อยู่นอกพื้นที่จุดหมาย'}
        message={prompt?.kind === 'geofence' ? prompt.message : 'งานจะถูกส่งต่อให้คนขับคนอื่น'}
        onCancel={() => setPrompt(null)}
        onSubmit={async (reason) => {
          if (prompt?.kind === 'geofence') return prompt.retry(reason);
          setPrompt(null);
          await act(() => api.post(`/driver/orders/${job.id}/cancel`, { reason }));
          await reloadDriver();
          router.replace('/(tabs)');
        }}
      />
    </View>
  );
}
