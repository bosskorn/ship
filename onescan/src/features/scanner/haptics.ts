import * as Haptics from 'expo-haptics';

/**
 * The scanner's only haptics (Phase 1): ready = light, capture = medium,
 * saved = success, error = warning. Fire-and-forget; never awaited on the capture path.
 */
const safe = (p: () => Promise<void>) => {
  try {
    p().catch(() => {});
  } catch {
    // No haptics engine (web, simulator).
  }
};

export const scanHaptics = {
  ready: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  capture: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  saved: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
