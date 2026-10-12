import { isActive } from '@/domain/job';
import type { Job } from '@/store/AppStore';

/** Technician chat stays open this long after a job closes (spec §42). */
export const CHAT_GRACE_DAYS = 3;

export function chatOpen(job: Job) {
  if (isActive(job.status) || job.status === 'created') return true;
  const closedAt = new Date(job.events.at(-1)?.at ?? job.createdAt).getTime();
  return Date.now() - closedAt < CHAT_GRACE_DAYS * 86_400_000;
}
