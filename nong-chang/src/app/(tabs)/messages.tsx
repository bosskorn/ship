import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAvatar, NBadge, NCell, NEmpty, NList, NTabs, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { technicianById } from '@/data/technicians';
import { chatOpen } from '@/lib/chat';
import { formatShortDate, formatTime } from '@/lib/format';
import { useApp } from '@/store/AppStore';
import { color, layout, space } from '@/theme/tokens';

type Tab = 'tech' | 'support' | 'system';

export default function Messages() {
  const insets = useSafeAreaInsets();
  const { state, markNotificationsRead } = useApp();
  const [tab, setTab] = useState<Tab>('tech');

  const threads = state.jobs
    .filter((j) => j.technicianId && j.status !== 'cancelled')
    .map((j) => ({ job: j, tech: technicianById(j.technicianId!)!, open: chatOpen(j) }));
  const system = state.notifications.filter((n) => n.group !== 'promo');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.title}>
        <NText variant="h2">ข้อความ</NText>
      </View>
      <NTabs
        items={[
          { value: 'tech', label: 'ช่าง' },
          { value: 'support', label: 'น้องช่าง Support' },
          { value: 'system', label: 'ระบบ', badge: system.filter((n) => !n.read).length || undefined },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'system') markNotificationsRead('system');
        }}
      />
      <ScrollView>
        {tab === 'tech' ? (
          threads.length ? (
            <NList>
              {threads.map(({ job, tech, open }) => (
                <NCell
                  key={job.id}
                  left={<NAvatar initials={tech.initials} size={44} />}
                  title={tech.name}
                  description={`${serviceById(job.serviceId)?.name} · งาน ${job.id}${open ? '' : ' · ปิดแชตแล้ว'}`}
                  note={formatShortDate(new Date(job.createdAt))}
                  onPress={() => router.push(`/chat/${job.id}`)}
                />
              ))}
            </NList>
          ) : (
            <NEmpty icon="chat" title="ยังไม่มีข้อความกับช่าง" description="แชตกับช่างจะผูกกับงานแต่ละงาน" />
          )
        ) : tab === 'support' ? (
          <NList>
            <NCell
              left={<NAvatar initials="น" size={44} />}
              title="น้องช่าง Support"
              description="ทีมงานพร้อมช่วยทุกวัน 08:00–22:00"
              arrow
              onPress={() => router.push('/support')}
            />
          </NList>
        ) : system.length ? (
          <NList>
            {system.map((n) => (
              <NCell
                key={n.id}
                title={n.title}
                description={n.body}
                note={formatTime(new Date(n.at))}
                right={!n.read ? <NBadge dot /> : undefined}
                onPress={n.jobId ? () => router.push(`/job/${n.jobId}`) : undefined}
              />
            ))}
          </NList>
        ) : (
          <NEmpty icon="bell" title="ไม่มีข้อความจากระบบ" />
        )}
        <View style={{ height: space.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  title: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, backgroundColor: color.bgContainer },
});
