/** Shared presentation of a job: headline, where it continues, compact progress. */
import type { Href } from 'expo-router';

import type { StepItem } from '@/components/NSteps';
import { hasReached, JobStatus } from '@/domain/job';
import type { Job } from '@/store/AppStore';

export function jobHeadline(status: JobStatus): string {
  switch (status) {
    case 'created':
      return 'นัดหมายแล้ว';
    case 'matching':
      return 'กำลังหาน้องช่างใกล้คุณ';
    case 'matched':
      return 'ได้ช่างแล้ว';
    case 'en_route':
      return 'ช่างกำลังเดินทาง';
    case 'arrived':
      return 'ช่างถึงหน้างานแล้ว';
    case 'started':
      return 'ช่างกำลังตรวจหน้างาน';
    case 'quoted':
      return 'รออนุมัติใบเสนอราคา';
    case 'approved':
    case 'in_progress':
      return 'กำลังดำเนินงาน';
    case 'completed':
      return 'งานเสร็จแล้ว รอคุณยืนยัน';
    case 'confirmed':
      return 'รอชำระเงิน';
    case 'paid':
    case 'reviewed':
      return 'งานเสร็จเรียบร้อย';
    case 'cancelled':
      return 'ยกเลิกแล้ว';
  }
}

export function jobTarget(job: Job): Href {
  switch (job.status) {
    case 'matching':
      return `/job/${job.id}/matching`;
    case 'quoted':
      return `/job/${job.id}/quote`;
    case 'approved':
    case 'in_progress':
      return `/job/${job.id}/progress`;
    case 'completed':
      return `/job/${job.id}/complete`;
    case 'confirmed':
      return `/job/${job.id}/payment`;
    case 'matched':
    case 'en_route':
    case 'arrived':
    case 'started':
      return `/job/${job.id}/tracking`;
    default:
      return `/job/${job.id}`;
  }
}

const COMPACT: { status: JobStatus; label: string }[] = [
  { status: 'matched', label: 'รับงาน' },
  { status: 'en_route', label: 'เดินทาง' },
  { status: 'arrived', label: 'ถึงหน้างาน' },
  { status: 'in_progress', label: 'ทำงาน' },
  { status: 'completed', label: 'เสร็จ' },
];

/** ✓ รับงาน ✓ เดินทาง ● ถึงหน้างาน ○ ทำงาน ○ เสร็จ */
export function compactSteps(status: JobStatus): StepItem[] {
  return COMPACT.map((s, i) => {
    const reached = hasReached(status, s.status);
    const next = COMPACT[i + 1];
    const done = reached && (!next ? true : hasReached(status, next.status));
    return { key: s.status, title: s.label, state: done ? 'done' : reached ? 'current' : 'pending' };
  });
}
