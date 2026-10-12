import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NAppBar, NChip, NEmpty, NFadeIn, NScreen, NServiceItem, NSkeletonRow, NText } from '@/components';
import { CATEGORIES, CategoryId, servicesIn } from '@/data/catalog';
import { track } from '@/lib/analytics';
import { color, layout, space } from '@/theme/tokens';

export default function AllServices() {
  const params = useLocalSearchParams<{ category?: CategoryId; asap?: string }>();
  const [category, setCategory] = useState<CategoryId>(params.category ?? 'aircon');
  const [loadedCategory, setLoadedCategory] = useState<CategoryId>();
  const loading = loadedCategory !== category;
  const asap = params.asap === '1';

  useEffect(() => {
    const t = setTimeout(() => setLoadedCategory(category), 250);
    return () => clearTimeout(t);
  }, [category]);

  const cat = CATEGORIES.find((c) => c.id === category)!;
  const services = servicesIn(category);

  return (
    <NScreen scroll={false}>
      <NAppBar title={asap ? 'เรียกช่างตอนนี้' : 'บริการทั้งหมด'} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {CATEGORIES.map((c) => (
            <NChip key={c.id} label={c.name} selected={c.id === category} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        {asap ? (
          <NText variant="secondary" color="textSecondary" style={styles.hint}>
            เลือกบริการ แล้วน้องช่างจะหาช่างที่ใกล้และว่างที่สุดให้ทันที
          </NText>
        ) : null}
        {loading ? (
          [0, 1, 2].map((i) => <NSkeletonRow key={i} avatar={false} />)
        ) : !cat.available ? (
          <NEmpty
            icon="clock"
            title={`${cat.name} เร็ว ๆ นี้`}
            description="เรากำลังเพิ่มช่างในหมวดนี้ จะแจ้งให้ทราบเมื่อเปิดให้บริการ"
          />
        ) : (
          <NFadeIn style={{ backgroundColor: color.bgContainer }}>
            {services.map((s, i) => (
              <NServiceItem
                key={s.id}
                service={s}
                divider={i < services.length - 1}
                onPress={() => {
                  track('select_service', { serviceId: s.id, source: 'catalog' });
                  router.push({ pathname: '/services/[id]', params: { id: s.id, asap: asap ? '1' : undefined } });
                }}
              />
            ))}
          </NFadeIn>
        )}
      </ScrollView>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  filters: { backgroundColor: color.bgContainer, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  filterRow: { gap: space.xs, paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
  hint: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
});
