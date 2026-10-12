import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NButton, NChip, NEmpty, NIconButton, NScreen, NSearch, NSection, NServiceItem, NText } from '@/components';
import { SERVICES } from '@/data/catalog';
import { rankServices } from '@/domain/search';
import { track } from '@/lib/analytics';
import { color, layout, space } from '@/theme/tokens';

const POPULAR = ['แอร์ไม่เย็น', 'น้ำรั่ว', 'ปลั๊กเสีย', 'ล้างแอร์', 'ท่อตัน', 'แม่บ้าน'];

export default function Search() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const results = useMemo(() => rankServices(query, SERVICES, 8), [query]);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => track('search_service', { query, results: results.length }), 600);
    return () => clearTimeout(t);
  }, [query, results.length]);

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
        <NIconButton icon="back" accessibilityLabel="ย้อนกลับ" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <NSearch value={query} onChangeText={setQuery} autoFocus={!params.q} onCameraPress={() => router.push('/diagnosis')} />
        </View>
      </View>
      <NScreen keyboardDismissMode="on-drag">
        {!query.trim() ? (
          <NSection title="ปัญหาที่พบบ่อย">
            <View style={styles.chips}>
              {POPULAR.map((p) => (
                <NChip key={p} label={p} onPress={() => setQuery(p)} />
              ))}
            </View>
            <View style={styles.photoHint}>
              <NText variant="secondary" color="textSecondary" style={{ flex: 1 }}>
                อธิบายไม่ถูก? ถ่ายรูปให้น้องช่างช่วยแนะนำบริการ
              </NText>
              <NButton theme="outline" size="small" icon="camera" onPress={() => router.push('/diagnosis')}>
                ถ่ายรูปปัญหา
              </NButton>
            </View>
          </NSection>
        ) : results.length ? (
          <NSection title="บริการที่ตรงกับปัญหา" flush>
            <View style={{ backgroundColor: color.bgContainer }}>
              {results.map(({ item }, i) => (
                <NServiceItem
                  key={item.id}
                  service={item}
                  divider={i < results.length - 1}
                  onPress={() => {
                    track('select_service', { serviceId: item.id, source: 'search', query });
                    router.push(`/services/${item.id}`);
                  }}
                />
              ))}
            </View>
          </NSection>
        ) : (
          <NEmpty
            icon="search"
            title="ไม่พบบริการที่ตรงกัน"
            description="ลองใช้คำอื่น หรือถ่ายรูปปัญหาให้เราช่วยแนะนำ"
            action={
              <NButton theme="outline" size="medium" icon="camera" onPress={() => router.push('/diagnosis')}>
                ถ่ายรูปปัญหา
              </NButton>
            }
          />
        )}
      </NScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingRight: layout.screenPadding,
    paddingLeft: space.xxs,
    paddingBottom: space.xs,
    backgroundColor: color.bgContainer,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoHint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl },
});
