import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NDialog, NDivider, NEmpty, NIcon, NPhotoGrid, NPrice, NScreen, NSection, NTechnicianItem, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { quoteTotal } from '@/domain/pricing';
import { formatBaht } from '@/lib/format';
import { useApp, useJob, useTechnician } from '@/store/AppStore';
import { color, radius, space } from '@/theme/tokens';

/**
 * Quote approval (spec §33). The technician cannot start additional work
 * until the customer approves — the job state machine enforces this too
 * (`canStartWork`).
 */
export default function QuoteApproval() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);
  const { approveQuote, rejectQuote } = useApp();
  const [rejecting, setRejecting] = useState(false);

  if (!job?.quote || job.status !== 'quoted') {
    return (
      <NScreen scroll={false}>
        <NAppBar title="ใบเสนอราคา" />
        <NEmpty title="ไม่มีใบเสนอราคารออนุมัติ" action={<NButton theme="outline" size="medium" onPress={() => router.back()}>กลับ</NButton>} />
      </NScreen>
    );
  }

  const service = serviceById(job.serviceId);
  const breakdown = quoteTotal(job.quote);

  return (
    <NScreen
      footer={
        <NBottomBar
          summary={
            <View style={styles.totalRow}>
              <NText variant="body" color="textSecondary">
                รวม
              </NText>
              <NPrice amount={breakdown.total} size="large" />
            </View>
          }
        >
          <NButton theme="default" style={{ flex: 1 }} onPress={() => setRejecting(true)}>
            ไม่อนุมัติ
          </NButton>
          <NButton
            theme="primary"
            haptics
            style={{ flex: 2 }}
            onPress={() => {
              approveQuote(job.id);
              router.replace(`/job/${job.id}/progress`);
            }}
          >
            {`อนุมัติ ${formatBaht(breakdown.total)} บาท`}
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="ใบเสนอราคา" />
      <View style={styles.banner}>
        <NIcon name="shield" size={20} color={color.primary} />
        <NText variant="secondary" style={{ flex: 1, color: color.primary }}>
          ตรวจสอบราคาก่อนเริ่มงาน ช่างจะเริ่มซ่อมหลังคุณอนุมัติเท่านั้น
        </NText>
      </View>

      <NSection title="ปัญหาที่พบ">
        <View style={styles.block}>
          <NText variant="body">{service?.name} — วาล์วน้ำเสื่อมและข้อต่อรั่วซึม ต้องเปลี่ยนใหม่</NText>
          <NPhotoGrid uris={job.beforePhotos} label="ก่อนซ่อม" size={88} />
        </View>
      </NSection>

      <NSection title="รายการ">
        <View style={styles.block}>
          {breakdown.lines.map((l) => (
            <View key={l.key} style={styles.line}>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'} style={{ flex: 1 }}>
                {l.kind === 'inspection' ? 'ค่าสำรวจ' : l.label}
                {l.kind === 'part' ? <NText variant="caption" color="textSecondary">  อะไหล่</NText> : null}
              </NText>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'}>
                {l.amount < 0 ? '-' : ''}
                {formatBaht(Math.abs(l.amount))}
              </NText>
            </View>
          ))}
          <NDivider />
          <View style={styles.line}>
            <NText variant="bodyStrong" style={{ flex: 1 }}>
              รวม
            </NText>
            <NPrice amount={breakdown.total} />
          </View>
        </View>
      </NSection>

      {tech ? (
        <NSection title="ช่างผู้เสนอราคา">
          <View style={styles.block}>
            <NTechnicianItem technician={tech} compact />
          </View>
        </NSection>
      ) : null}

      <NDialog
        visible={rejecting}
        title="ไม่อนุมัติใบเสนอราคา?"
        content={`คุณจะชำระเฉพาะค่าตรวจหน้างาน ${formatBaht(job.quote.inspectionCredit)} บาท และงานนี้จะถูกปิด`}
        cancelText="กลับไปดู"
        confirmText="ไม่อนุมัติ"
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={() => {
          setRejecting(false);
          rejectQuote(job.id);
          router.replace(`/job/${job.id}`);
        }}
      />
    </NScreen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: color.primaryLight, paddingHorizontal: space.md, paddingVertical: space.sm },
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
