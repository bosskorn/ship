import * as Haptics from 'expo-haptics';

/**
 * Interaction haptics for the app shell (navigation, selection, long press).
 * Fire-and-forget: a device without a haptics engine simply does nothing.
 */
const safe = (p: () => Promise<void>) => {
  try {
    p().catch(() => {});
  } catch {
    // No haptics engine (web, simulator, tests).
  }
};

export const haptics = {
  /** Primary action pressed (Scan). */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Tab / chip / option changed. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Long press opened a menu or started selection. */
  long: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
