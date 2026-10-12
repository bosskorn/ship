import { router, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NongChangSymbol } from '@/brand/Logo';
import { NAvatar, NButton, NCell, NDialog, NIcon, NList, NPressable, NText, useToast, type IconName } from '@/components';
import { USER } from '@/data/user';
import { daysBetween } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useApp } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

const maskPhone = (p: string) => p.replace(/^(\d{3})-?(\d{3})-?(\d{4})$/, '$1-xxx-$3');

export default function Account() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { state } = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const soon = () => toast('เร็ว ๆ นี้');
  const go = (href: Href) => () => router.push(href);

  const activeWarranties = state.jobs.filter((j) => j.warrantyUntil && daysBetween(new Date(), new Date(j.warrantyUntil)) > 0).length;
  const receipts = state.jobs.filter((j) => j.status === 'paid' || j.status === 'reviewed').length;

  const quick: { icon: IconName; label: string; sub?: string; onPress: () => void }[] = [
    { icon: 'home', label: 'บ้านของฉัน', sub: '4 อุปกรณ์', onPress: go('/my-home') },
    { icon: 'ticket', label: 'คูปอง', sub: '1 ใบ', onPress: soon },
    { icon: 'shield', label: 'การรับประกัน', sub: activeWarranties ? `${activeWarranties} งาน` : undefined, onPress: go('/warranty') },
    { icon: 'receipt', label: 'ใบเสร็จ', sub: receipts ? `${receipts} ใบ` : undefined, onPress: go('/jobs') },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
      {/* Profile header */}
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={styles.profile}>
          <NAvatar initials={USER.name} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <NText variant="h2">{USER.name}</NText>
            <NText variant="secondary" color="textSecondary">
              {maskPhone(USER.phone)}
            </NText>
          </View>
          <NPressable style={styles.edit} accessibilityLabel="แก้ไขข้อมูลส่วนตัว" onPress={soon}>
            <NIcon name="edit" size={18} color={color.textSecondary} />
          </NPressable>
        </View>

        {/* Membership — a brand moment */}
        <NPressable scaleTo={0.98} style={styles.member} onPress={soon} accessibilityLabel="น้องช่าง Care">
          <View style={styles.memberLogo}>
            <NongChangSymbol size={36} tone="white" />
          </View>
          <View style={{ flex: 1 }}>
            <NText variant="label" style={styles.memberSoft}>
              สมาชิก
            </NText>
            <NText variant="h3" style={styles.memberText}>
              น้องช่าง Care
            </NText>
            <NText variant="caption" style={styles.memberSoft}>
              ส่วนลด · จับคู่ช่างก่อน · รับประกันเพิ่ม
            </NText>
          </View>
          <NIcon name="chevron-right" size={20} color="rgba(255,255,255,0.8)" />
        </NPressable>
      </View>

      {/* Quick actions */}
      <View style={styles.quick}>
        {quick.map((q) => (
          <NPressable key={q.label} style={styles.quickItem} onPress={q.onPress} accessibilityLabel={q.label}>
            <View style={styles.quickIcon}>
              <NIcon name={q.icon} size={24} color={color.primary} />
            </View>
            <NText variant="secondaryStrong" align="center" numberOfLines={1}>
              {q.label}
            </NText>
            <NText variant="caption" color="textSecondary" style={{ minHeight: 18 }}>
              {q.sub ?? ' '}
            </NText>
          </NPressable>
        ))}
      </View>

      <Group title="บัญชี">
        <NList inset>
          <NCell leftIcon="user" title="ข้อมูลส่วนตัว" arrow onPress={soon} />
          <NCell leftIcon="location" title="ที่อยู่" note="บ้าน" arrow onPress={go('/booking/address')} />
          <NCell leftIcon="card" title="วิธีชำระเงิน" note="พร้อมเพย์" arrow onPress={soon} />
        </NList>
      </Group>

      <Group title="เอกสาร">
        <NList inset>
          <NCell leftIcon="file" title="ใบกำกับภาษี" arrow onPress={soon} />
        </NList>
      </Group>

      <Group title="ช่วยเหลือและตั้งค่า">
        <NList inset>
          <NCell leftIcon="help" title="ศูนย์ช่วยเหลือ" arrow onPress={go('/support')} />
          <NCell leftIcon="bell" title="การแจ้งเตือน" arrow onPress={go('/notifications')} />
          <NCell leftIcon="settings" title="ตั้งค่า" arrow onPress={soon} />
        </NList>
      </Group>

      <View style={styles.footer}>
        <NButton theme="text" onPress={() => setConfirm(true)}>
          ออกจากระบบ
        </NButton>
        <NText variant="caption" color="textPlaceholder">
          น้องช่าง เวอร์ชัน 1.1.0
        </NText>
      </View>

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
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <NText variant="secondaryStrong" color="textSecondary" style={styles.groupTitle}>
        {title}
      </NText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  header: {
    backgroundColor: color.bgContainer,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
    gap: space.md,
    borderBottomLeftRadius: radius.dialog,
    borderBottomRightRadius: radius.dialog,
  },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  edit: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.graphicDeep,
    borderRadius: radius.dialog,
    padding: space.md,
  },
  memberLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  memberText: { color: '#FFFFFF' },
  memberSoft: { color: 'rgba(255,255,255,0.75)' },
  quick: {
    flexDirection: 'row',
    marginTop: space.md,
    marginHorizontal: layout.screenPadding,
    backgroundColor: color.bgContainer,
    borderRadius: radius.dialog,
    paddingVertical: space.md,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: 4 },
  quickIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  groupTitle: { paddingHorizontal: layout.screenPadding + space.xxs, marginBottom: space.xs },
  footer: { alignItems: 'center', gap: space.xxs, marginTop: space.lg },
});
