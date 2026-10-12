/** Domain components: NServiceItem, NTechnicianItem, NJobStatus, NAddressPicker. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Service } from '@/data/catalog';
import type { Technician } from '@/data/technicians';
import type { Address } from '@/data/user';
import { JobStatus, STATUS_LABEL, statusTone } from '@/domain/job';
import { formatBaht, formatRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { color, layout, space } from '@/theme/tokens';

import { NIconButton } from './NButton';
import { NAvatar, NPrice, NTag } from './NDisplay';
import { NIcon } from './NIcon';
import { NText } from './NText';

export function NServiceItem({ service, onPress, action, divider = true }: { service: Service; onPress?: () => void; action?: React.ReactNode; divider?: boolean }) {
  // The row and its optional action are siblings, never nested pressables.
  return (
    <View style={[styles.serviceRow, divider && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic.select();
          onPress?.();
        }}
        style={({ pressed }) => [styles.service, pressed && { backgroundColor: color.bgSecondary }]}
      >
        <View style={{ flex: 1, gap: space.xxs }}>
          <NText variant="bodyStrong">{service.name}</NText>
          <NText variant="secondary" color="textSecondary">
            {formatRange(service.durationMin, service.durationMax, 'นาที')} · รับประกัน {service.warrantyDays} วัน
          </NText>
          <View style={styles.priceRow}>
            {service.pricing === 'inspection' ? (
              <>
                <NText variant="caption" color="textSecondary">
                  ค่าตรวจ
                </NText>
                <NPrice amount={service.price} size="small" />
              </>
            ) : (
              <NPrice amount={service.price} size="small" unit={`บาท / ${service.unit}`} />
            )}
          </View>
        </View>
        {action ? null : <NIcon name="chevron-right" size={18} color={color.textPlaceholder} />}
      </Pressable>
      {action ? <View style={styles.serviceAction}>{action}</View> : null}
    </View>
  );
}

export function NTechnicianItem({
  technician,
  etaMinutes,
  onCall,
  onChat,
  compact,
}: {
  technician: Technician;
  etaMinutes?: number;
  onCall?: () => void;
  onChat?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.tech}>
      <NAvatar photo={technician.photo} initials={technician.name} size={compact ? 44 : 56} verified={technician.verified} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.inline}>
          <NText variant="bodyStrong">{technician.name}</NText>
          {technician.verified ? <NTag tone="primary" size="small">ยืนยันตัวตนแล้ว</NTag> : null}
        </View>
        <View style={styles.inline}>
          <NIcon name="star-filled" size={14} color={color.rating} />
          <NText variant="secondary" color="textSecondary">
            {technician.rating.toFixed(1)} · {formatBaht(technician.jobs)} งาน
          </NText>
        </View>
        {!compact ? (
          <NText variant="secondary" color="textSecondary">
            {technician.specialty}
          </NText>
        ) : null}
        {etaMinutes !== undefined ? (
          <NText variant="secondaryStrong" color="primary">
            ถึงประมาณ {etaMinutes} นาที
          </NText>
        ) : null}
      </View>
      {onCall || onChat ? (
        <View style={styles.inline}>
          {onChat ? <NIconButton icon="chat" accessibilityLabel="ข้อความ" bordered onPress={onChat} /> : null}
          {onCall ? <NIconButton icon="phone" accessibilityLabel="โทร" bordered onPress={onCall} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function NJobStatus({ status }: { status: JobStatus }) {
  return <NTag tone={statusTone(status)}>{STATUS_LABEL[status]}</NTag>;
}

export function NAddressPicker({ address, onPress }: { address: Address; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.address, pressed && { backgroundColor: color.bgSecondary }]}>
      <NIcon name="location" size={22} color={color.primary} />
      <View style={{ flex: 1 }}>
        <NText variant="bodyStrong">{address.label}</NText>
        <NText variant="secondary" color="textSecondary" numberOfLines={2}>
          {[address.line, address.building, address.floor && `ชั้น ${address.floor}`, address.room && `ห้อง ${address.room}`, address.district]
            .filter(Boolean)
            .join(' · ')}
        </NText>
      </View>
      <NText variant="secondaryStrong" color="primary">
        เปลี่ยน
      </NText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  serviceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.bgContainer },
  service: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
  },
  serviceAction: { paddingRight: layout.screenPadding },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs, marginTop: space.xxs },
  tech: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
    backgroundColor: color.bgContainer,
  },
});
