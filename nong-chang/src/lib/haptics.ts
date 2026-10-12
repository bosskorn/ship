/**
 * Haptic vocabulary (spec §58). Screens call intent-named helpers, never
 * expo-haptics directly, so the feel stays consistent.
 */
import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {
    // Haptics unsupported (simulator / web) — silently ignore.
  });
};

export const haptic = {
  /** Selecting a service, tab or option. */
  select: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Technician accepted, payment succeeded, job completed. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Important error, price changed. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
