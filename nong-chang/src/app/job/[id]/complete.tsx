import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { NAppBar, NBottomBar, NButton, NDivider, NEmpty, NIcon, NPhotoGrid, NPrice, NScreen, NSection, NText } from '@/components';
import { serviceById } from '@/data/catalog';
import { formatBaht } from '@/lib/format';
import { useApp, useJob } from '@/store/AppStore';
import { color, radius, space } from '@/theme/tokens';

/** Job complete — customer reviews the work before paying (spec §35). */
export default function JobComplete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const { confirmComplete } = useApp();
  if (!job) return <NEmpty title="ไม่พบงานนี้" />;
  const service = serviceById(job.serviceId);

  return (
    <NScreen
      footer={
        <NBottomBar>
          <NButton theme="default" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/support', params: { jobId: job.id } })}>
            แจ้งปัญหา
          </NButton>
          <NButton
            theme="primary"
            style={{ flex: 2 }}
            disabled={job.status !== 'completed'}
            onPress={() => {
              confirmComplete(job.id);
              router.replace(`/job/${job.id}/payment`);
            }}
          >
            ยืนยันงานเสร็จ
          </NButton>
        </NBottomBar>
      }
    >
      <NAppBar title="งานเสร็จเรียบร้อย" />
      <NSection title="ก่อน / หลัง" style={{ marginTop: space.md }}>
        <View style={styles.block}>
          <NPhotoGrid uris={job.beforePhotos} label="ก่อน" size={96} />
          <NPhotoGrid uris={job.afterPhotos} label="หลัง" size={96} />
        </View>
      </NSection>

      <NSection title="รายละเอียดงาน">
        <View style={styles.block}>
          <NText variant="bodyStrong">{service?.name}</NText>
          {job.quote ? (
            job.quote.parts.map((p) => (
              <View key={p.label} style={styles.line}>
                <NText variant="body" style={{ flex: 1 }}>
                  อะไหล่: {p.label}
                </NText>
                <NText variant="body">{formatBaht(p.amount)}</NText>
              </View>
            ))
          ) : (
            <NText variant="secondary" color="textSecondary">
              {service?.included.join(' · ')}
            </NText>
          )}
          <NDivider />
          <View style={styles.line}>
            <NIcon name="shield" size={20} color={color.primary} />
            <NText variant="body" style={{ flex: 1 }}>
              รับประกันงาน {service?.warrantyDays} วัน หลังชำระเงิน
            </NText>
          </View>
        </View>
      </NSection>

      <NSection title="ยอดสุดท้าย">
        <View style={[styles.block, styles.line]}>
          <NText variant="body" color="textSecondary" style={{ flex: 1 }}>
            ยอดชำระ
          </NText>
          <NPrice amount={job.total} size="large" decimals />
        </View>
      </NSection>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
