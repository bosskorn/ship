import { router, useLocalSearchParams, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  NAppBar,
  NBottomBar,
  NButton,
  NCell,
  NDivider,
  NEmpty,
  NJobStatus,
  NList,
  NPhotoGrid,
  NPrice,
  NScreen,
  NSection,
  NSteps,
  NTechnicianItem,
  NText,
  StepItem,
} from '@/components';
import { serviceById } from '@/data/catalog';
import { DETAIL_STEPS, hasReached, isActive, JobStatus } from '@/domain/job';
import { calculatePrice, quoteTotal } from '@/domain/pricing';
import { daysBetween, formatBaht, formatDayDate, formatShortDate, formatTime } from '@/lib/format';
import { PAYMENT_LABEL, useJob, useTechnician } from '@/store/AppStore';
import { color, layout, radius, space } from '@/theme/tokens';

/** Map of status → the screen that continues the flow from Job Detail. */
const CONTINUE: Partial<Record<JobStatus, { label: string; href: (id: string) => Href }>> = {
  matching: { label: 'ดูการค้นหาช่าง', href: (id) => `/job/${id}/matching` },
  matched: { label: 'ติดตามช่าง', href: (id) => `/job/${id}/tracking` },
  en_route: { label: 'ติดตามช่าง', href: (id) => `/job/${id}/tracking` },
  arrived: { label: 'ยืนยันพบช่าง', href: (id) => `/job/${id}/tracking` },
  started: { label: 'ติดตามช่าง', href: (id) => `/job/${id}/tracking` },
  quoted: { label: 'ตรวจสอบใบเสนอราคา', href: (id) => `/job/${id}/quote` },
  approved: { label: 'ดูความคืบหน้า', href: (id) => `/job/${id}/progress` },
  in_progress: { label: 'ดูความคืบหน้า', href: (id) => `/job/${id}/progress` },
  completed: { label: 'ตรวจงานและยืนยัน', href: (id) => `/job/${id}/complete` },
  confirmed: { label: 'ชำระเงิน', href: (id) => `/job/${id}/payment` },
  paid: { label: 'ให้คะแนนช่าง', href: (id) => `/job/${id}/review` },
};

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const tech = useTechnician(job?.technicianId);

  if (!job) {
    return (
      <NScreen scroll={false}>
        <NAppBar title="รายละเอียดงาน" />
        <NEmpty title="ไม่พบงานนี้" />
      </NScreen>
    );
  }

  const service = serviceById(job.serviceId);
  const breakdown = job.quote
    ? quoteTotal(job.quote)
    : calculatePrice({ base: service?.price ?? 0, quantity: service?.pricing === 'fixed' ? job.quantity : 1 });
  const historical = job.events.length === 0 && hasReached(job.status, 'paid'); // seeded history has no event log

  const steps: StepItem[] = DETAIL_STEPS.filter((s) => s.status !== 'quoted' || job.quote || service?.pricing === 'inspection').map((s, i, all) => {
    const ev = job.events.find((e) => e.status === s.status);
    const reached = historical || hasReached(job.status, s.status);
    const nextReached = i < all.length - 1 && (historical || hasReached(job.status, all[i + 1].status));
    return {
      key: s.status,
      title: s.label,
      description: ev ? `${formatShortDate(new Date(ev.at))} ${formatTime(new Date(ev.at))}` : undefined,
      state: reached ? (nextReached || s.status === 'paid' ? 'done' : 'current') : 'pending',
    };
  });

  const warrantyLeft = job.warrantyUntil ? daysBetween(new Date(), new Date(job.warrantyUntil)) : 0;
  const cont = CONTINUE[job.status];
  const when = job.schedule.mode === 'scheduled' && job.schedule.at ? `${formatDayDate(new Date(job.schedule.at))} ${formatTime(new Date(job.schedule.at))}` : formatDayDate(new Date(job.createdAt));

  return (
    <NScreen
      footer={
        cont ? (
          <NBottomBar>
            <NButton theme="primary" block onPress={() => router.push(cont.href(job.id))}>
              {cont.label}
            </NButton>
          </NBottomBar>
        ) : warrantyLeft > 0 ? (
          <NBottomBar>
            <NButton theme="outline" block onPress={() => router.push({ pathname: '/warranty', params: { claim: job.id } })}>
              แจ้งปัญหางานเดิม
            </NButton>
          </NBottomBar>
        ) : null
      }
    >
      <NAppBar title="รายละเอียดงาน" />
      <View style={styles.head}>
        <View style={styles.row}>
          <NText variant="h2" style={{ flex: 1 }}>
            {service?.name}
          </NText>
          <NJobStatus status={job.status} />
        </View>
        <NText variant="secondary" color="textSecondary">
          งาน {job.id} · {when}
        </NText>
      </View>

      {tech ? (
        <NSection title="ช่าง">
          <View style={styles.block}>
            <NTechnicianItem technician={tech} compact onChat={isActive(job.status) ? () => router.push(`/chat/${job.id}`) : undefined} />
          </View>
        </NSection>
      ) : null}

      <NSection title="สถานะงาน">
        <View style={styles.block}>
          <NSteps items={steps} compact />
        </View>
      </NSection>

      {job.beforePhotos.length || job.afterPhotos.length ? (
        <NSection title="ก่อน / หลัง">
          <View style={styles.block}>
            <NPhotoGrid uris={[...job.beforePhotos]} label="ก่อน" />
            {job.afterPhotos.length ? <NPhotoGrid uris={job.afterPhotos} label="หลัง" /> : null}
          </View>
        </NSection>
      ) : null}

      <NSection title={hasReached(job.status, 'paid') ? 'ใบเสร็จ' : 'ราคา'}>
        <View style={styles.block}>
          {breakdown.lines.map((l) => (
            <View key={l.key} style={styles.line}>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'} style={{ flex: 1 }}>
                {l.kind === 'base' ? `${service?.name}${job.quantity > 1 ? ` × ${job.quantity}` : ''}` : l.label}
              </NText>
              <NText variant="body" color={l.amount < 0 ? 'success' : 'textPrimary'}>
                {l.amount < 0 ? '-' : ''}
                {formatBaht(Math.abs(l.amount))}
              </NText>
            </View>
          ))}
          {job.discount && !job.quote ? (
            <View style={styles.line}>
              <NText variant="body" color="success" style={{ flex: 1 }}>
                ส่วนลด
              </NText>
              <NText variant="body" color="success">
                -{formatBaht(job.discount)}
              </NText>
            </View>
          ) : null}
          <NDivider />
          <View style={styles.line}>
            <NText variant="bodyStrong" style={{ flex: 1 }}>
              รวม
            </NText>
            <NPrice amount={job.total} decimals={hasReached(job.status, 'paid')} />
          </View>
          <NText variant="caption" color="textSecondary">
            ชำระด้วย {PAYMENT_LABEL[job.paymentMethod]}
          </NText>
        </View>
      </NSection>

      <NSection flush>
        <NList>
          <NCell leftIcon="location" title={job.address.label} description={`${job.address.line} · ${job.address.district}`} />
          <NCell
            leftIcon="shield"
            title="การรับประกัน"
            note={job.warrantyUntil ? (warrantyLeft > 0 ? `เหลือ ${warrantyLeft} วัน` : 'หมดประกันแล้ว') : `${service?.warrantyDays} วันหลังชำระเงิน`}
            arrow={!!job.warrantyUntil}
            onPress={job.warrantyUntil ? () => router.push('/warranty') : undefined}
          />
          <NCell leftIcon="jobs" title="ใบกำกับภาษี" note="ขอใบกำกับภาษี" arrow onPress={() => router.push({ pathname: '/support', params: { jobId: job.id, topic: 'tax' } })} />
          <NCell leftIcon="help" title="ช่วยเหลือเกี่ยวกับงานนี้" arrow onPress={() => router.push({ pathname: '/support', params: { jobId: job.id } })} />
        </NList>
      </NSection>
    </NScreen>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: color.bgContainer, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  block: { backgroundColor: color.bgContainer, borderRadius: radius.card, padding: space.md, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});
