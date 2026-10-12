import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomSheet, NButton, NEmpty, NInput, NPhotoGrid, NProgress, NScreen, NSection, NTag, NText, useToast } from '@/components';
import { serviceById } from '@/data/catalog';
import { track } from '@/lib/analytics';
import { daysBetween, formatShortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { pickPhoto } from '@/lib/media';
import { useApp, type Job } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

/** การรับประกันของฉัน (spec §41) with the claim flow: photo → describe → submit. */
export default function Warranty() {
  const { claim } = useLocalSearchParams<{ claim?: string }>();
  const { state } = useApp();
  const toast = useToast();
  const [claimJob, setClaimJob] = useState<string | undefined>(claim);
  const [photos, setPhotos] = useState<string[]>([]);
  const [desc, setDesc] = useState('');

  const items = state.jobs.filter((j) => j.warrantyUntil).sort((a, b) => b.warrantyUntil!.localeCompare(a.warrantyUntil!));

  const submit = () => {
    track('warranty_requested', { jobId: claimJob, photos: photos.length });
    haptic.success();
    setClaimJob(undefined);
    setPhotos([]);
    setDesc('');
    toast('ส่งคำขอแล้ว น้องช่างจะติดต่อกลับภายใน 2 ชั่วโมง', { theme: 'success' });
  };

  return (
    <NScreen>
      <NAppBar title="การรับประกันของฉัน" />
      {items.length ? (
        <NSection style={{ marginTop: space.md }}>
          <View style={{ gap: space.sm }}>
            {items.map((j) => (
              <WarrantyItem key={j.id} job={j} onClaim={() => setClaimJob(j.id)} />
            ))}
          </View>
        </NSection>
      ) : (
        <NEmpty icon="shield" title="ยังไม่มีงานในการรับประกัน" description="งานที่ชำระเงินแล้วจะได้รับประกันอัตโนมัติ" />
      )}

      <NBottomSheet
        visible={!!claimJob}
        onClose={() => setClaimJob(undefined)}
        title="แจ้งปัญหางานเดิม"
        footer={
          <NButton theme="primary" block disabled={!desc.trim()} onPress={submit}>
            ส่งคำขอ
          </NButton>
        }
      >
        <View style={styles.sheet}>
          <NText variant="secondary" color="textSecondary">
            1. ถ่ายรูปปัญหา
          </NText>
          <NPhotoGrid
            uris={photos}
            onAdd={async () => {
              const r = await pickPhoto('camera');
              if ('uri' in r) setPhotos((p) => [...p, r.uri]);
            }}
            onRemove={(u) => setPhotos((p) => p.filter((x) => x !== u))}
          />
          <NText variant="secondary" color="textSecondary">
            2. อธิบายปัญหา
          </NText>
          <NInput value={desc} onChangeText={setDesc} placeholder="เช่น ล้างแอร์ไปแล้วยังมีน้ำหยด" multiline style={{ minHeight: 72, textAlignVertical: 'top' }} />
        </View>
      </NBottomSheet>
    </NScreen>
  );
}

function WarrantyItem({ job, onClaim }: { job: Job; onClaim: () => void }) {
  const service = serviceById(job.serviceId);
  const until = new Date(job.warrantyUntil!);
  const left = daysBetween(new Date(), until);
  const total = service?.warrantyDays ?? 30;
  const active = left > 0;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <NText variant="bodyStrong" style={{ flex: 1 }} onPress={() => router.push(`/job/${job.id}`)}>
          {service?.name}
        </NText>
        <NTag tone={active ? (left <= 7 ? 'warning' : 'success') : 'default'}>{active ? `เหลือ ${left} วัน` : 'หมดประกัน'}</NTag>
      </View>
      <NText variant="secondary" color="textSecondary">
        หมดประกัน {formatShortDate(until)} · งาน {job.id}
      </NText>
      {active ? <NProgress value={left / total} tone={left <= 7 ? 'warning' : 'success'} /> : null}
      {active ? (
        <NButton theme="outline" size="medium" onPress={onClaim}>
          แจ้งปัญหางานเดิม
        </NButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sheet: { paddingHorizontal: layout.screenPadding, gap: space.sm },
});
