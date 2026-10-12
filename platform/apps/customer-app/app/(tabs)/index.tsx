import { Feather } from '@expo/vector-icons';
import { Cell, color, dateShort, Empty, font, Money, Section, space, statusText, statusTone, Tag } from '@ship/mobile-ui';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { DraftStop, ServiceKind, useDraft } from '../../lib/draft';

const SERVICES: { key: ServiceKind; title: string; desc: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'INSTANT', title: 'ส่งด่วน', desc: 'คนขับรับทันที', icon: 'zap' },
  { key: 'MULTI_STOP', title: 'ส่งหลายจุด', desc: 'สูงสุด 20 จุด', icon: 'git-commit' },
  { key: 'SCHEDULED', title: 'จองล่วงหน้า', desc: 'เลือกเวลารับ', icon: 'calendar' },
  { key: 'BUSINESS', title: 'งานธุรกิจ', desc: 'บัญชีองค์กร', icon: 'briefcase' },
];

export default function Home() {
  const { reset } = useDraft();
  const [here, setHere] = useState<{ location: { lat: number; lng: number }; address: string } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [zone, setZone] = useState<{ serviceable: boolean; zone: { name: string } | null } | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const locate = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return setLocError('เปิดสิทธิ์ตำแหน่งเพื่อปักหมุดจุดรับอัตโนมัติ');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const [geo] = await Location.reverseGeocodeAsync({ latitude: location.lat, longitude: location.lng }).catch(() => []);
    const address = geo ? [geo.name, geo.street, geo.district, geo.subregion].filter(Boolean).join(' ') : 'ตำแหน่งปัจจุบัน';
    setHere({ location, address });
    setZone(await api.get(`/zones/lookup?lat=${location.lat}&lng=${location.lng}`).catch(() => null));
  }, []);

  const load = useCallback(async () => {
    const [r, o, s] = await Promise.all([
      api.get('/me/recent-locations').catch(() => []),
      api.get('/orders?limit=5').catch(() => []),
      api.get('/me/addresses').catch(() => []),
    ]);
    setRecent(r);
    setOrders(o);
    setSaved(s);
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const start = (service: ServiceKind, pickup?: Partial<DraftStop>) => {
    if (service === 'BUSINESS') return router.push('/(tabs)/account');
    reset(service, pickup ?? (here ? { location: here.location, address: here.address } : undefined));
    router.push('/create/stops');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), locate()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={{ padding: space.lg, backgroundColor: color.surface }}>
          <Text style={font.title}>ส่งของจากที่ไหน?</Text>
          <Pressable onPress={() => start('INSTANT')} style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: color.border, borderRadius: 3, padding: space.md, gap: space.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.success }} />
            <View style={{ flex: 1 }}>
              <Text style={[font.caption, { color: color.text3 }]}>จุดรับ (ตำแหน่งปัจจุบัน)</Text>
              <Text style={font.body} numberOfLines={1}>
                {here?.address ?? locError ?? 'กำลังหาตำแหน่ง...'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={color.placeholder} />
          </Pressable>
          {zone && !zone.serviceable && (
            <Text style={[font.small, { color: color.warning, marginTop: space.sm }]}>ตำแหน่งนี้ยังอยู่นอกพื้นที่ให้บริการ (นำร่องกรุงเทพฯ)</Text>
          )}
          {zone?.serviceable && <Text style={[font.caption, { color: color.text3, marginTop: space.sm }]}>พื้นที่ให้บริการ: {zone.zone?.name}</Text>}
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.divider }}>
          {SERVICES.map((s) => (
            <Pressable key={s.key} onPress={() => start(s.key)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: space.md, backgroundColor: pressed ? color.divider : 'transparent' })}>
              <Feather name={s.icon} size={22} color={color.brand} />
              <Text style={[font.small, { marginTop: space.xs, fontWeight: '600' }]}>{s.title}</Text>
              <Text style={[font.caption, { color: color.text3 }]}>{s.desc}</Text>
            </Pressable>
          ))}
        </View>

        <Section title="สถานที่ล่าสุด">
          {recent.length ? (
            recent.slice(0, 4).map((r, i) => (
              <Cell
                key={`${r.address}-${i}`}
                title={r.address}
                description={r.contact_name}
                left={<Feather name="clock" size={16} color={color.text3} />}
                onPress={() => start('INSTANT', { location: { lat: Number(r.lat), lng: Number(r.lng) }, address: r.address, contactName: r.contact_name, contactPhone: r.contact_phone })}
                last={i === Math.min(recent.length, 4) - 1}
              />
            ))
          ) : (
            <Empty text="ยังไม่มีประวัติ" />
          )}
        </Section>

        <Section title="ออเดอร์ล่าสุด" right={<Text style={[font.small, { color: color.brand }]} onPress={() => router.push('/(tabs)/orders')}>ทั้งหมด</Text>}>
          {orders.length ? (
            orders.map((o, i) => (
              <Cell
                key={o.id}
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Tag text={statusText(o.status)} tone={statusTone(o.status)} />
                    <Text style={[font.caption, { color: color.text3 }]}>{dateShort(o.createdAt)}</Text>
                  </View>
                }
                description={`${o.pickup} → ${o.dropoff}`}
                value={<Money satang={o.price} />}
                onPress={() => router.push(`/order/${o.id}`)}
                last={i === orders.length - 1}
              />
            ))
          ) : (
            <Empty text="ยังไม่มีออเดอร์" />
          )}
        </Section>

        <Section title="ที่อยู่ที่บันทึกไว้" right={<Text style={[font.small, { color: color.brand }]} onPress={() => router.push('/addresses')}>จัดการ</Text>}>
          {saved.length ? (
            saved.slice(0, 3).map((a, i) => (
              <Cell
                key={a.id}
                title={a.label || a.address}
                description={a.label ? a.address : undefined}
                left={<Feather name="bookmark" size={16} color={color.text3} />}
                onPress={() => start('INSTANT', { location: { lat: Number(a.lat), lng: Number(a.lng) }, address: a.address, building: a.building ?? undefined, floor: a.floor ?? undefined, room: a.room ?? undefined, contactName: a.contact_name ?? '', contactPhone: a.contact_phone ?? '', note: a.note ?? undefined })}
                last={i === Math.min(saved.length, 3) - 1}
              />
            ))
          ) : (
            <Empty text="บันทึกที่อยู่ที่ใช้บ่อยเพื่อสร้างงานได้เร็วขึ้น" />
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
