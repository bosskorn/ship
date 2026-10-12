import { Cell, dateShort, Empty, Section } from '@ship/mobile-ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { api } from '../../lib/api';

export default function Activity() {
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => setItems(await api.get('/me/notifications').catch(() => [])), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={items ? <Empty text="ยังไม่มีการแจ้งเตือน" /> : null}
        ListHeaderComponent={<View style={{ height: 8 }} />}
        renderItem={({ item: n, index }) => (
          <Section style={{ marginTop: 0 }}>
            <Cell
              title={n.title}
              description={`${n.body} · ${dateShort(n.created_at)}`}
              onPress={n.data?.orderId ? () => router.push(`/order/${n.data.orderId}`) : undefined}
              arrow={!!n.data?.orderId}
              last={index === (items?.length ?? 0) - 1}
            />
          </Section>
        )}
      />
    </View>
  );
}
