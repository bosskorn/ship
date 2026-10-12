import { BottomBar, Button, Cell, Empty, Section } from '@ship/mobile-ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { api } from '../lib/api';
import { useDraft } from '../lib/draft';

/** Saved addresses. New ones are saved from the location picker flow ("ส่งไปที่นี่" pre-fills a draft). */
export default function Addresses() {
  const [items, setItems] = useState<any[] | null>(null);
  const { reset } = useDraft();
  const load = useCallback(async () => setItems(await api.get('/me/addresses').catch(() => [])), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = (id: string) =>
    Alert.alert('ลบที่อยู่', 'ต้องการลบที่อยู่นี้หรือไม่', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => void api.del(`/me/addresses/${id}`).then(load) },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView>
        <Section>
          {items?.length ? (
            items.map((a, i) => (
              <Cell
                key={a.id}
                title={a.label || a.address}
                description={[a.label ? a.address : null, a.contact_name, a.contact_phone].filter(Boolean).join(' · ')}
                onPress={() => {
                  reset('INSTANT', { location: { lat: Number(a.lat), lng: Number(a.lng) }, address: a.address, building: a.building ?? undefined, floor: a.floor ?? undefined, room: a.room ?? undefined, contactName: a.contact_name ?? '', contactPhone: a.contact_phone ?? '', note: a.note ?? undefined });
                  router.push('/create/stops');
                }}
                value={<Button title="ลบ" variant="text" size="small" block={false} onPress={() => remove(a.id)} />}
                last={i === items.length - 1}
              />
            ))
          ) : (
            <Empty text={items ? 'ยังไม่มีที่อยู่ที่บันทึกไว้' : 'กำลังโหลด...'} />
          )}
        </Section>
      </ScrollView>
      <BottomBar>
        <Button
          title="บันทึกจุดรับล่าสุดเป็นที่อยู่ใหม่"
          variant="outline"
          onPress={async () => {
            const recent = await api.get('/me/recent-locations');
            if (!recent.length) return Alert.alert('ยังไม่มีประวัติ', 'สร้างออเดอร์แรกก่อน แล้วจึงบันทึกที่อยู่');
            const r = recent[0];
            await api.post('/me/addresses', { address: r.address, contactName: r.contact_name, contactPhone: r.contact_phone, location: { lat: Number(r.lat), lng: Number(r.lng) } });
            await load();
          }}
        />
      </BottomBar>
    </View>
  );
}
