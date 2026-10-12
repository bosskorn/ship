import { Button, Cell, color, font, Section, space, Tag } from '@ship/mobile-ui';
import { KYC_STATUS_TH, KycStatus, VEHICLE_TH, VehicleType } from '@ship/shared';
import { Alert, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useDriver } from '../../lib/driver';
import { stopTracking } from '../../lib/location';

export default function Account() {
  const { me } = useDriver();
  if (!me) return null;
  const v = me.vehicles[0];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Section title="โปรไฟล์">
        <Cell title={`${me.first_name ?? ''} ${me.last_name ?? ''}`} description={me.phone} value={<Tag text={KYC_STATUS_TH[me.kyc_status as KycStatus]} tone="success" />} />
        <Cell title="ระดับ (Tier)" value={me.tier} />
        <Cell title="คะแนน" value={me.rating ? `★ ${me.rating}` : 'ยังไม่มี'} />
        <Cell title="อัตรารับงาน" value={me.acceptanceRate != null ? `${Math.round(me.acceptanceRate * 100)}%` : '–'} last />
      </Section>
      {v && (
        <Section title="รถ">
          <Cell title={`${VEHICLE_TH[v.type as VehicleType].name} · ${v.plate_number}`} description={`${v.plate_province} · ${[v.brand, v.model, v.color].filter(Boolean).join(' ')}`} last />
        </Section>
      )}
      <Section title="ความเป็นส่วนตัว">
        <Cell title="ตำแหน่ง" description="แอปส่งตำแหน่งเฉพาะตอนออนไลน์ ความถี่ต่ำขณะรองาน และถี่ขึ้นระหว่างส่งงาน" last />
      </Section>
      <View style={{ padding: space.lg }}>
        <Button
          title="ออกจากระบบ"
          variant="outline"
          onPress={() =>
            Alert.alert('ออกจากระบบ', 'ระบบจะตั้งสถานะออฟไลน์ก่อนออกจากระบบ', [
              { text: 'ยกเลิก', style: 'cancel' },
              {
                text: 'ออกจากระบบ',
                style: 'destructive',
                onPress: async () => {
                  await api.post('/driver/presence', { online: false }).catch(() => undefined);
                  await stopTracking();
                  await api.logout();
                },
              },
            ])
          }
        />
        <Text style={[font.caption, { color: color.text3, textAlign: 'center', marginTop: space.md }]}>Ship Driver · v0.1.0</Text>
      </View>
    </ScrollView>
  );
}
