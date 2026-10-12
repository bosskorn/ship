import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAvatar, NButton, NCell, NDialog, NIconButton, NList, NScreen, NSection, NTag, NText, useToast } from '@/components';
import { USER } from '@/data/user';
import { useAuth } from '@/lib/auth';
import { color, layout, space } from '@/theme/tokens';

export default function Account() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const soon = () => toast('เร็ว ๆ นี้');
  const go = (href: Href) => () => router.push(href);

  return (
    <NScreen>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <NAvatar initials={USER.initials} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <NText variant="h3">{USER.name}</NText>
          <NText variant="secondary" color="textSecondary">
            {USER.phone}
          </NText>
        </View>
        <NIconButton icon="chevron-right" accessibilityLabel="ข้อมูลส่วนตัว" onPress={soon} />
      </View>

      <NSection flush style={{ marginTop: space.md }}>
        <NList>
          <NCell leftIcon="user" title="ข้อมูลส่วนตัว" arrow onPress={soon} />
          <NCell leftIcon="home" title="บ้านของฉัน" arrow onPress={go('/my-home')} />
          <NCell leftIcon="location" title="ที่อยู่" arrow onPress={go('/booking/address')} />
        </NList>
      </NSection>

      <NSection flush style={{ marginTop: space.sm }}>
        <NList>
          <NCell title="วิธีชำระเงิน" arrow onPress={soon} />
          <NCell title="คูปอง" note="1 ใบ" arrow onPress={soon} />
          <NCell title="สมาชิก" right={<NTag tone="primary" size="small">น้องช่าง Care</NTag>} arrow onPress={soon} />
          <NCell leftIcon="shield" title="การรับประกันของฉัน" arrow onPress={go('/warranty')} />
          <NCell title="ใบเสร็จ" arrow onPress={go('/jobs')} />
          <NCell title="ใบกำกับภาษี" arrow onPress={soon} />
        </NList>
      </NSection>

      <NSection flush style={{ marginTop: space.sm }}>
        <NList>
          <NCell leftIcon="help" title="ศูนย์ช่วยเหลือ" arrow onPress={go('/support')} />
          <NCell leftIcon="bell" title="การแจ้งเตือน" arrow onPress={go('/notifications')} />
          <NCell title="ตั้งค่า" arrow onPress={soon} />
        </NList>
      </NSection>

      <NSection>
        <NButton theme="default" block onPress={() => setConfirm(true)}>
          ออกจากระบบ
        </NButton>
        <NText variant="caption" color="textPlaceholder" align="center" style={{ marginTop: space.md }}>
          น้องช่าง เวอร์ชัน 1.0.0
        </NText>
      </NSection>

      <NDialog
        visible={confirm}
        title="ออกจากระบบ?"
        cancelText="ยกเลิก"
        confirmText="ออกจากระบบ"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          signOut();
        }}
      />
    </NScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.bgContainer,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
  },
});
