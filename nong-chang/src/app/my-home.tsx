import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomSheet, NButton, NCell, NChip, NList, NScreen, NSection, NTag, NText } from '@/components';
import { PLACE_TYPE_LABEL, PROPERTIES, type Appliance } from '@/data/user';
import { color, layout, space } from '@/theme/tokens';

/** บ้านของฉัน (spec §45): properties → rooms → appliances with service history. */
export default function MyHome() {
  const [propertyId, setPropertyId] = useState(PROPERTIES[0].id);
  const [room, setRoom] = useState<string | undefined>();
  const [selected, setSelected] = useState<Appliance>();
  const property = PROPERTIES.find((p) => p.id === propertyId)!;
  const appliances = property.appliances.filter((a) => !room || a.room === room);

  return (
    <NScreen>
      <NAppBar title="บ้านของฉัน" />
      <View style={styles.head}>
        <View style={styles.row}>
          <NText variant="h2" style={{ flex: 1 }}>
            {property.name}
          </NText>
          <NTag>{PLACE_TYPE_LABEL[property.type]}</NTag>
        </View>
        <View style={styles.chips}>
          {PROPERTIES.length > 1
            ? PROPERTIES.map((p) => <NChip key={p.id} label={p.name} selected={p.id === propertyId} onPress={() => setPropertyId(p.id)} />)
            : null}
        </View>
      </View>

      <NSection title="ห้อง">
        <View style={styles.chips}>
          <NChip label="ทั้งหมด" selected={!room} onPress={() => setRoom(undefined)} />
          {property.rooms.map((r) => (
            <NChip key={r} label={r} selected={room === r} onPress={() => setRoom(r)} />
          ))}
        </View>
      </NSection>

      <NSection title="อุปกรณ์" flush>
        <NList>
          {appliances.map((a) => (
            <NCell
              key={a.id}
              title={`${a.type} · ${a.room}`}
              description={`${a.brand} ${a.model}${a.nextMaintenance ? ` · ดูแลครั้งถัดไป ${a.nextMaintenance}` : ''}`}
              arrow
              onPress={() => setSelected(a)}
            />
          ))}
        </NList>
      </NSection>

      <NSection>
        <NButton theme="default" icon="plus" block onPress={() => {}}>
          เพิ่มอุปกรณ์
        </NButton>
      </NSection>

      <NBottomSheet
        visible={!!selected}
        onClose={() => setSelected(undefined)}
        title={selected ? `${selected.type} · ${selected.room}` : ''}
        footer={
          selected?.type === 'แอร์' ? (
            <NButton
              theme="primary"
              block
              onPress={() => {
                setSelected(undefined);
                router.push('/services/aircon-wash');
              }}
            >
              นัดล้างแอร์
            </NButton>
          ) : undefined
        }
      >
        {selected ? (
          <View>
            <NCell title="ยี่ห้อ" note={selected.brand} divider />
            <NCell title="รุ่น" note={selected.model} divider />
            <NCell title="วันที่ติดตั้ง" note={selected.installed} divider />
            <NCell title="บริการล่าสุด" note={selected.lastService ?? '—'} divider />
            <NCell title="การรับประกัน" note={selected.warrantyUntil ? `ถึง ${selected.warrantyUntil}` : '—'} divider />
            <NCell title="ดูแลครั้งถัดไป" note={selected.nextMaintenance ?? '—'} />
          </View>
        ) : null}
      </NBottomSheet>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
