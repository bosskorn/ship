import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking } from 'react-native';

import { NAppBar, NCell, NList, NScreen, NSection, NText, useToast } from '@/components';

const FAQ = [
  'ช่างมาช้ากว่าที่แจ้ง ทำอย่างไร',
  'ราคาหน้างานไม่ตรงกับที่แจ้ง',
  'ยกเลิกงานแล้วเสียค่าใช้จ่ายไหม',
  'การรับประกันครอบคลุมอะไรบ้าง',
  'ขอใบกำกับภาษีได้อย่างไร',
];

export default function Support() {
  const { jobId } = useLocalSearchParams<{ jobId?: string; topic?: string }>();
  const toast = useToast();
  return (
    <NScreen>
      <NAppBar title="ศูนย์ช่วยเหลือ" />
      {jobId ? (
        <NText variant="secondary" color="textSecondary" style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          เกี่ยวกับงาน {jobId}
        </NText>
      ) : null}
      <NSection title="ติดต่อน้องช่าง" flush>
        <NList>
          <NCell leftIcon="chat" title="แชตกับ Support" description="ตอบภายในไม่กี่นาที · 08:00–22:00" arrow onPress={() => toast('กำลังเชื่อมต่อเจ้าหน้าที่')} />
          <NCell leftIcon="phone" title="โทร 02-000-0000" description="กรณีเร่งด่วนเกี่ยวกับงานที่กำลังดำเนินการ" arrow onPress={() => Linking.openURL('tel:020000000')} />
        </NList>
      </NSection>
      <NSection title="คำถามที่พบบ่อย" flush>
        <NList>
          {FAQ.map((q) => (
            <NCell key={q} title={q} arrow onPress={() => toast('เร็ว ๆ นี้')} />
          ))}
        </NList>
      </NSection>
    </NScreen>
  );
}
