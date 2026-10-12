import { Feather } from '@expo/vector-icons';
import { ApiError, Button, Cell, color, font, Money, Section, space } from '@ship/mobile-ui';
import type { EarningsSummary } from '@ship/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { useDriver } from '../../lib/driver';
import { currentPosition, ensurePermissions, startTracking } from '../../lib/location';

export default function Home() {
  const { me, activeOrderId, setOnline } = useDriver();
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<EarningsSummary | null>(null);
  const online = me?.presence !== 'OFFLINE';

  useFocusEffect(
    useCallback(() => {
      void api.get<EarningsSummary>('/driver/earnings?period=today').then(setToday).catch(() => undefined);
    }, []),
  );

  const toggle = async () => {
    setBusy(true);
    try {
      if (online) {
        await setOnline(false);
      } else {
        const perm = await ensurePermissions();
        if (!perm.ok) {
          Alert.alert('ต้องการสิทธิ์ตำแหน่ง', 'เปิดสิทธิ์ตำแหน่งเพื่อรับงาน', [{ text: 'เปิดการตั้งค่า', onPress: () => Linking.openSettings() }, { text: 'ปิด' }]);
          return;
        }
        if (!perm.background) Alert.alert('แนะนำให้อนุญาตตำแหน่ง "ตลอดเวลา"', 'เพื่อให้รับงานได้แม้หน้าจอดับหรือใช้แอปอื่นอยู่');
        const location = await currentPosition();
        await setOnline(true, location);
        await startTracking('idle');
      }
    } catch (e) {
      Alert.alert('เปลี่ยนสถานะไม่สำเร็จ', (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const busyWithJob = me?.presence === 'BUSY';
  const stateColor = busyWithJob ? color.brand : online ? color.success : color.text3;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={{ padding: space.lg, backgroundColor: color.surface, alignItems: 'center', gap: space.md }}>
          <Text style={[font.small, { color: color.text2 }]}>
            {me?.first_name} · {me?.tier} · {me?.vehicles?.[0]?.plate_number ?? ''}
          </Text>
          <Pressable
            onPress={toggle}
            disabled={busy || busyWithJob}
            accessibilityRole="switch"
            accessibilityState={{ checked: online, disabled: busy || busyWithJob }}
            style={({ pressed }) => ({
              width: 168,
              height: 168,
              borderRadius: 84,
              borderWidth: 6,
              borderColor: stateColor,
              backgroundColor: online ? (busyWithJob ? color.brandLight : color.successLight) : color.divider,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            <Feather name="power" size={40} color={stateColor} />
            <Text style={[font.h2, { color: stateColor, marginTop: space.xs }]}>{busyWithJob ? 'มีงาน' : online ? 'ออนไลน์' : 'ออฟไลน์'}</Text>
          </Pressable>
          <Text style={[font.small, { color: color.text2, textAlign: 'center' }]}>
            {busyWithJob ? 'ทำงานปัจจุบันให้เสร็จก่อนออฟไลน์' : online ? 'กำลังรอรับงาน · ส่งตำแหน่งอัตโนมัติ (ประหยัดแบตเตอรี่)' : 'แตะเพื่อออนไลน์และเริ่มรับงาน'}
          </Text>
        </View>

        {activeOrderId && (
          <Section>
            <Cell title={<Text style={[font.bodyStrong, { color: color.brand }]}>มีงานที่กำลังทำอยู่</Text>} description="แตะเพื่อดูขั้นตอนถัดไป" onPress={() => router.push('/job')} arrow last />
          </Section>
        )}

        <Section title="วันนี้">
          <View style={{ flexDirection: 'row', padding: space.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={[font.caption, { color: color.text3 }]}>รายได้สุทธิ</Text>
              <Money satang={today?.netEarnings ?? 0} size="number" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font.caption, { color: color.text3 }]}>งาน</Text>
              <Text style={font.number}>{today?.trips ?? 0}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font.caption, { color: color.text3 }]}>ออนไลน์</Text>
              <Text style={font.number}>{Math.floor((today?.onlineSeconds ?? 0) / 3600)}:{String(Math.floor(((today?.onlineSeconds ?? 0) % 3600) / 60)).padStart(2, '0')}</Text>
            </View>
          </View>
          <Cell title="ดูรายละเอียดรายได้" onPress={() => router.push('/(tabs)/earnings')} arrow last />
        </Section>
        {!online && (
          <View style={{ padding: space.lg }}>
            <Button title="ออนไลน์" onPress={toggle} loading={busy} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
