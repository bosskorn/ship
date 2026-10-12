import { Button, Cell, color, Field, font, Section, space } from '@ship/mobile-ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';

export default function Account() {
  const [me, setMe] = useState<any>(null);
  const [name, setName] = useState('');
  useFocusEffect(
    useCallback(() => {
      void api.get('/auth/me').then((u) => {
        setMe(u);
        setName(u.display_name ?? '');
      });
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Section title="ข้อมูลของฉัน">
        <Field label="ชื่อที่แสดง" value={name} onChangeText={setName} onEndEditing={() => name.trim() && void api.patch('/me/profile', { name: name.trim() })} />
        <Cell title="เบอร์มือถือ" value={me?.phone ?? ''} last />
      </Section>
      <Section title="การส่งของ">
        <Cell title="ที่อยู่ที่บันทึกไว้" onPress={() => router.push('/addresses')} arrow />
        <Cell title="วิธีชำระเงิน" description="เงินสด · QR พร้อมเพย์ · บัตร (เลือกตอนสั่ง)" />
        <Cell title="บัญชีธุรกิจ" description="ใบแจ้งหนี้รายเดือน, API, นำเข้า Excel — เปิดให้ใช้งานใน Phase 2" last />
      </Section>
      <Section title="ช่วยเหลือ">
        <Cell title="ติดต่อฝ่ายบริการลูกค้า" description="โทร 02-000-0000 (ตัวอย่าง)" last />
      </Section>
      <View style={{ padding: space.lg }}>
        <Button
          title="ออกจากระบบ"
          variant="outline"
          onPress={() =>
            Alert.alert('ออกจากระบบ', 'ต้องการออกจากระบบหรือไม่', [
              { text: 'ยกเลิก', style: 'cancel' },
              { text: 'ออกจากระบบ', style: 'destructive', onPress: () => void api.logout() },
            ])
          }
        />
        <Text style={[font.caption, { color: color.text3, textAlign: 'center', marginTop: space.md }]}>Ship · v0.1.0</Text>
      </View>
    </ScrollView>
  );
}
