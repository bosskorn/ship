import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NButton, NEmpty, NFadeIn, NJobStatus, NOfflineBanner, NPrice, NSkeletonRow, NTabs, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { technicianById } from '@/data/technicians';
import { isActive } from '@/domain/job';
import { formatDayDate } from '@/lib/format';
import { useIsOffline } from '@/lib/network';
import { useApp, type Job } from '@/store/AppStore';
import { color, layout, space } from '@/theme/tokens';

type Tab = 'active' | 'scheduled' | 'done';

export default function MyJobs() {
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const offline = useIsOffline();
  const [tab, setTab] = useState<Tab>('active');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (state.booting) return;
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, [state.booting]);

  const groups = useMemo(
    () => ({
      active: state.jobs.filter((j) => isActive(j.status)),
      scheduled: state.jobs.filter((j) => j.status === 'created'),
      done: state.jobs.filter((j) => ['paid', 'reviewed', 'cancelled'].includes(j.status)),
    }),
    [state.jobs],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.title}>
        <NText variant="h2">งานของฉัน</NText>
      </View>
      <NTabs
        items={[
          { value: 'active', label: 'กำลังดำเนินการ' },
          { value: 'scheduled', label: 'นัดหมาย' },
          { value: 'done', label: 'เสร็จแล้ว' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {offline ? <NOfflineBanner lastSyncedAt={state.lastSyncedAt} /> : null}
      {!ready ? (
        <View>
          {[0, 1, 2].map((i) => (
            <NSkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <NFadeIn style={{ flex: 1 }}>
          <FlatList
            data={groups[tab]}
            keyExtractor={(j) => j.id}
            renderItem={({ item }) => <JobRow job={item} />}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <NEmpty
                title={tab === 'active' ? 'ยังไม่มีงานที่กำลังดำเนินการ' : tab === 'scheduled' ? 'ยังไม่มีนัดหมาย' : 'ยังไม่มีงานที่เสร็จแล้ว'}
                description="เรื่องบ้าน เรียกน้องช่าง"
                action={
                  <NButton theme="outline" size="medium" onPress={() => router.push('/services')}>
                    เลือกบริการ
                  </NButton>
                }
              />
            }
          />
        </NFadeIn>
      )}
    </View>
  );
}

function JobRow({ job }: { job: Job }) {
  const service = serviceById(job.serviceId);
  const tech = job.technicianId ? technicianById(job.technicianId) : undefined;
  const date = job.schedule.mode === 'scheduled' && job.schedule.at ? new Date(job.schedule.at) : new Date(job.createdAt);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/job/${job.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.bgSecondary }]}
    >
      <View style={styles.rowTop}>
        <NText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {service?.name}
          {job.quantity > 1 ? ` × ${job.quantity}` : ''}
        </NText>
        <NJobStatus status={job.status} />
      </View>
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <NText variant="secondary" color="textSecondary">
            {formatDayDate(date)} · {tech ? tech.name : 'รอจับคู่ช่าง'}
          </NText>
        </View>
        <NPrice amount={job.total} size="small" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgPage },
  title: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, backgroundColor: color.bgContainer },
  row: { backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.xxs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider },
});
