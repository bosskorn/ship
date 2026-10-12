import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NEmpty, NProgress, NScreen, NSection, NTechnicianItem, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { formatTime } from '@/lib/format';
import { useJob, useTechnician } from '@/store/AppStore';
import { color, radius, space } from '@/theme/tokens';

/** Work in progress (spec §34). */
export default function WorkProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const status = job?.status;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status === 'completed') router.replace(`/job/${id}/complete`);
  }, [status, id]);

  if (!job) return <NEmpty title="ไม่พบงานนี้" />;

  const service = serviceById(job.serviceId);
  const startedAt = job.events.find((e) => e.status === 'in_progress')?.at;
  const start = startedAt ? new Date(startedAt) : undefined;
  const eta = start && service ? new Date(start.getTime() + service.durationMax * 60_000) : undefined;
  const elapsed = start && service ? (now - start.getTime()) / (service.durationMax * 60_000) : 0;

  return (
    <NScreen
      footer={
        <NBottomBar>
          <NButton theme="default" icon="chat" block onPress={() => router.push(`/chat/${job.id}`)}>
            ส่งข้อความถึงช่าง
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="ความคืบหน้า" />
      <NSection style={{ marginTop: space.md }}>
        <View style={styles.block}>
          <NText variant="h2">{job.status === 'approved' ? 'ช่างกำลังเตรียมเริ่มงาน' : 'กำลังดำเนินงาน'}</NText>
          <NProgress value={job.status === 'approved' ? 0.05 : Math.max(0.1, Math.min(0.9, elapsed))} />
          <View style={styles.times}>
            <View>
              <NText variant="caption" color="textSecondary">
                เวลาเริ่ม
              </NText>
              <NText variant="bodyStrong">{start ? formatTime(start) : '—'}</NText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <NText variant="caption" color="textSecondary">
                คาดว่าเสร็จ
              </NText>
              <NText variant="bodyStrong">{eta ? formatTime(eta) : '—'}</NText>
            </View>
          </View>
          <NText variant="caption" color="textSecondary">
            เราจะแจ้งเตือนเมื่อสถานะงานเปลี่ยน
          </NText>
        </View>
      </NSection>

      <NSection title="รายการงาน">
        <View style={styles.block}>
          {(job.quote ? [`ค่าแรง`, ...job.quote.parts.map((p) => `เปลี่ยน${p.label}`)] : service?.included ?? []).map((t) => (
            <NText key={t} variant="body">
              · {t}
            </NText>
          ))}
        </View>
      </NSection>

      {tech ? (
        <NSection title="ช่าง">
          <View style={styles.block}>
            <NTechnicianItem technician={tech} compact />
          </View>
        </NSection>
      ) : null}
    </NScreen>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.sm },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
