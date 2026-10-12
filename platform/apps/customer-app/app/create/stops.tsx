import { Feather } from '@expo/vector-icons';
import { BottomBar, Button, Cell, color, font, Section, space } from '@ship/mobile-ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { DraftStop, emptyStop, stopReady, useDraft } from '../../lib/draft';

/** UX limit for v1; the API/DB accept up to 20 drop-offs (spec §6). */
const UX_MAX_DROPOFFS = 10;

function slots(): { label: string; iso: string }[] {
  const out: { label: string; iso: string }[] = [];
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60_000);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
  for (let i = 0; i < 48; i++) {
    const d = new Date(start.getTime() + i * 30 * 60_000);
    if (d.getHours() < 7 || d.getHours() > 21) continue;
    const day = d.toDateString() === now.toDateString() ? 'วันนี้' : 'พรุ่งนี้';
    out.push({ label: `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, iso: d.toISOString() });
  }
  return out.slice(0, 24);
}

export default function Stops() {
  const { draft, update } = useDraft();
  const scheduleSlots = useMemo(slots, []);
  const multi = draft.dropoffs.length > 1 || draft.service === 'MULTI_STOP';
  const ready = stopReady(draft.pickup) && draft.dropoffs.every(stopReady) && (draft.service !== 'SCHEDULED' || !!draft.scheduledAt);

  const row = (s: DraftStop, target: string, label: string, dot: string, i?: number) => (
    <Cell
      key={target}
      left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />}
      title={s.address || <Text style={[font.body, { color: color.placeholder }]}>{label}</Text>}
      description={s.contactName ? `${s.contactName} · ${s.contactPhone}${s.building ? ` · ${s.building}` : ''}` : s.address ? 'เพิ่มชื่อและเบอร์ผู้ติดต่อ' : undefined}
      onPress={() => router.push({ pathname: '/create/location', params: { target } })}
      value={
        i !== undefined && draft.dropoffs.length > 1 ? (
          <Pressable hitSlop={12} onPress={() => update({ dropoffs: draft.dropoffs.filter((_, j) => j !== i) })}>
            <Feather name="x" size={18} color={color.text3} />
          </Pressable>
        ) : undefined
      }
      arrow
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <Section title="จุดรับสินค้า">{row(draft.pickup, 'pickup', 'เลือกจุดรับ', color.success)}</Section>
        <Section title={multi ? `จุดส่ง (${draft.dropoffs.length})` : 'จุดส่งสินค้า'}>
          {draft.dropoffs.map((d, i) => row(d, `drop-${i}`, `เลือกจุดส่ง${multi ? ` ${i + 1}` : ''}`, color.warning, i))}
          {draft.dropoffs.length < UX_MAX_DROPOFFS && (
            <Cell
              title={<Text style={[font.body, { color: color.brand }]}>+ เพิ่มจุดส่ง</Text>}
              onPress={() => {
                update({ dropoffs: [...draft.dropoffs, emptyStop()] });
                router.push({ pathname: '/create/location', params: { target: `drop-${draft.dropoffs.length}` } });
              }}
              last
            />
          )}
        </Section>
        {multi && (
          <Section title="ลำดับการส่ง">
            <Cell
              title="ให้ระบบจัดลำดับที่เร็วที่สุด"
              description="จุดที่ล็อกไว้จะคงลำดับเดิม (กดค้างที่จุดส่งเพื่อเปิด/ปิดล็อกในหน้าตำแหน่ง)"
              value={<Switch value={draft.optimizeRoute} onValueChange={(v) => update({ optimizeRoute: v })} />}
              last
            />
          </Section>
        )}
        {draft.service === 'SCHEDULED' && (
          <Section title="เวลารับสินค้า">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: space.md, gap: space.sm }}>
              {scheduleSlots.map((s) => {
                const active = draft.scheduledAt === s.iso;
                return (
                  <Pressable key={s.iso} onPress={() => update({ scheduledAt: s.iso })} style={{ paddingHorizontal: space.md, height: 36, justifyContent: 'center', borderRadius: 3, borderWidth: 1, borderColor: active ? color.brand : color.border, backgroundColor: active ? color.brandLight : color.surface }}>
                    <Text style={[font.small, { color: active ? color.brand : color.text }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Section>
        )}
      </ScrollView>
      <BottomBar>
        <Button title="ถัดไป: ข้อมูลสินค้า" disabled={!ready} onPress={() => router.push('/create/parcel')} />
      </BottomBar>
    </View>
  );
}
