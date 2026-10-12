import { Feather } from '@expo/vector-icons';
import { BottomBar, Button, Cell, color, Field, font, Section, space } from '@ship/mobile-ui';
import type { ParcelInput } from '@ship/shared';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/draft';

const CATEGORIES: { value: ParcelInput['category']; label: string }[] = [
  { value: 'DOCUMENT', label: 'เอกสาร' },
  { value: 'FOOD', label: 'อาหาร' },
  { value: 'SMALL_BOX', label: 'กล่องเล็ก' },
  { value: 'ELECTRONICS', label: 'อิเล็กทรอนิกส์' },
  { value: 'LARGE_ITEM', label: 'ของชิ้นใหญ่' },
  { value: 'FURNITURE', label: 'เฟอร์นิเจอร์' },
  { value: 'OTHER', label: 'อื่น ๆ' },
];

export default function Parcel() {
  const { draft, update } = useDraft();
  const p = draft.parcel;
  const [photos, setPhotos] = useState<{ uri: string; key: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<ParcelInput>) => update({ parcel: { ...p, ...patch } });
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('ต้องการสิทธิ์กล้อง', 'เปิดสิทธิ์กล้องในการตั้งค่า');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (r.canceled) return;
    setUploading(true);
    try {
      const key = await api.uploadFile(r.assets[0].uri, 'PARCEL');
      const next = [...photos, { uri: r.assets[0].uri, key }];
      setPhotos(next);
      set({ photoKeys: next.map((x) => x.key) });
    } catch (e) {
      Alert.alert('อัปโหลดไม่สำเร็จ', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <Section title="ประเภทสินค้า">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.md }}>
            {CATEGORIES.map((c) => {
              const active = p.category === c.value;
              return (
                <Pressable key={c.value} onPress={() => set({ category: c.value })} style={{ paddingHorizontal: space.md, height: 36, justifyContent: 'center', borderRadius: 3, borderWidth: 1, borderColor: active ? color.brand : color.border, backgroundColor: active ? color.brandLight : color.surface }}>
                  <Text style={[font.small, { color: active ? color.brand : color.text }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>
        <Section title="ขนาดและน้ำหนัก">
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Field label="น้ำหนักต่อชิ้น (กก.)" keyboardType="decimal-pad" value={String(p.weightKg ?? '')} onChangeText={(v) => set({ weightKg: num(v) ?? 0 })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="จำนวนชิ้น" keyboardType="number-pad" value={String(p.quantity ?? 1)} onChangeText={(v) => set({ quantity: Math.max(1, Math.round(num(v) ?? 1)) })} />
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Field label="ยาว (ซม.)" keyboardType="decimal-pad" value={p.lengthCm ? String(p.lengthCm) : ''} onChangeText={(v) => set({ lengthCm: num(v) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="กว้าง (ซม.)" keyboardType="decimal-pad" value={p.widthCm ? String(p.widthCm) : ''} onChangeText={(v) => set({ widthCm: num(v) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="สูง (ซม.)" keyboardType="decimal-pad" value={p.heightCm ? String(p.heightCm) : ''} onChangeText={(v) => set({ heightCm: num(v) })} />
            </View>
          </View>
        </Section>
        <Section title="การดูแลพิเศษ">
          <Cell title="แตกง่าย" value={<Switch value={!!p.fragile} onValueChange={(v) => set({ fragile: v })} />} />
          <Cell title="ควบคุมอุณหภูมิ" value={<Switch value={!!p.temperatureSensitive} onValueChange={(v) => set({ temperatureSensitive: v })} />} />
          <Cell title="สินค้ามูลค่าสูง" value={<Switch value={!!p.highValue} onValueChange={(v) => set({ highValue: v })} />} last={!p.highValue} />
          {p.highValue && <Field label="มูลค่าโดยประมาณ (บาท)" keyboardType="number-pad" value={p.declaredValue ? String(p.declaredValue) : ''} onChangeText={(v) => set({ declaredValue: num(v) })} />}
        </Section>
        <Section title="หมายเหตุและรูปสินค้า">
          <Field label="หมายเหตุ" value={p.note ?? ''} onChangeText={(v) => set({ note: v })} />
          <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md }}>
            {photos.map((x) => (
              <Image key={x.key} source={{ uri: x.uri }} style={{ width: 64, height: 64, borderRadius: 3 }} />
            ))}
            {photos.length < 5 && (
              <Pressable onPress={addPhoto} disabled={uploading} style={{ width: 64, height: 64, borderWidth: 1, borderStyle: 'dashed', borderColor: color.border, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={uploading ? 'loader' : 'camera'} size={20} color={color.text3} />
              </Pressable>
            )}
          </View>
        </Section>
      </ScrollView>
      <BottomBar>
        <Button title="ถัดไป: เลือกรถและดูราคา" disabled={!p.weightKg || p.weightKg <= 0} onPress={() => router.push('/create/vehicle')} />
      </BottomBar>
    </View>
  );
}
