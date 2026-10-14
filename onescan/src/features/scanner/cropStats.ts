import { useSettings } from '@/core/config/settingsStore';
import type { DraftPage } from '@/core/document-engine/model';
import { track } from '@/services/analytics/analytics';
import { useScanDiagnostics } from '@/core/document-engine/image/diagnostics';

/** A captured page got its automatic crop decision (counts + anonymous event). */
export function noteCropResult(page: DraftPage) {
  const c = page.crop;
  if (!c) return;
  useSettings.getState().countCrop(c.decision);
  track('crop_result', { decision: c.decision, confidence: Math.round(c.confidence * 20) / 20 });
}

/** The user changed the crop by hand (Manual Correction Rate). */
export function noteCropCorrected(page: DraftPage) {
  const c = page.crop;
  if (!c) return;
  if (c.decision === 'auto') useSettings.getState().countCrop('autoCorrected');
  else if (c.decision === 'review') useSettings.getState().countCrop('reviewCorrected');
  if (c.diagId !== undefined) useScanDiagnostics.getState().markCropCorrected(c.diagId);
  track('crop_corrected', { decision: c.decision });
}

/** The user accepted a suggested crop as it was. */
export function noteCropAccepted(page: DraftPage) {
  if (page.crop?.decision === 'review') useSettings.getState().countCrop('reviewAccepted');
}

/** Corrected share of crops the app applied (auto) or proposed (suggested), 0..1 or null. */
export function manualCorrectionRate(s = useSettings.getState().cropStats) {
  const applied = s.auto + s.review;
  return applied ? (s.autoCorrected + s.reviewCorrected) / applied : null;
}
