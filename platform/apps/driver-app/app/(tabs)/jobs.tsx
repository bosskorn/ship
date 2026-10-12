import { Cell, color, dateShort, Empty, font, Money, Section, space, statusText, statusTone, Tag } from '@ship/mobile-ui';
import { numericToSatang } from '@ship/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useDriver } from '../../lib/driver';

export default function Jobs() {
  const { activeOrderId } = useDriver();
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => setItems(await api.get('/driver/orders/history').catch(() => [])), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        activeOrderId ? (
          <Section>
            <Cell title={<Text style={[font.bodyStrong, { color: color.brand }]}>งานปัจจุบัน</Text>} description="ไปยังขั้นตอนถัดไป" onPress={() => router.push('/job')} arrow last />
          </Section>
        ) : (
          <View style={{ height: space.sm }} />
        )
      }
      ListEmptyComponent={items ? <Empty text="ยังไม่มีประวัติงาน" /> : null}
      renderItem={({ item: o, index }) => (
        <Section style={{ marginTop: index === 0 ? space.md : 0 }}>
          <Cell
            title={
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Tag text={statusText(o.status)} tone={statusTone(o.status)} />
                <Text style={[font.caption, { color: color.text3 }]}>{o.order_no} · {dateShort(o.delivered_at ?? o.created_at)}</Text>
              </View>
            }
            description={`${o.pickup} → ${o.dropoff}`}
            value={o.driver_net ? <Money satang={numericToSatang(o.driver_net)} /> : undefined}
            last
          />
        </Section>
      )}
    />
  );
}
