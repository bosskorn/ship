import { Cell, color, dateShort, Empty, font, Money, Section, Segmented, space, statusText, statusTone, Tag } from '@ship/mobile-ui';
import { VEHICLE_TH, VehicleType } from '@ship/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { api } from '../../lib/api';

export default function Orders() {
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => setItems(await api.get(`/orders?status=${tab}&limit=50`).catch(() => [])), [tab]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.md, backgroundColor: color.surface }}>
        <Segmented value={tab} onChange={(v) => { setItems(null); setTab(v); }} options={[{ value: 'active', label: 'กำลังดำเนินการ' }, { value: 'past', label: 'ประวัติ' }]} />
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={items ? <Empty text={tab === 'active' ? 'ไม่มีงานที่กำลังส่ง' : 'ยังไม่มีประวัติ'} /> : null}
        renderItem={({ item: o }) => (
          <Section style={{ marginTop: space.sm }}>
            <Cell
              title={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Tag text={statusText(o.status)} tone={statusTone(o.status)} />
                  <Text style={[font.caption, { color: color.text3 }]}>
                    {o.orderNo} · {VEHICLE_TH[o.vehicleType as VehicleType]?.name}
                  </Text>
                </View>
              }
              description={`${o.pickup} → ${o.dropoff}${o.dropoffCount > 1 ? ` (+${o.dropoffCount - 1} จุด)` : ''}\n${dateShort(o.scheduledAt ?? o.createdAt)}`}
              value={<Money satang={o.price} strong />}
              onPress={() => router.push(`/order/${o.id}`)}
              arrow
              last
            />
          </Section>
        )}
      />
    </View>
  );
}
