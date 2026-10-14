import React from 'react';
import { Platform, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCellGroup, TEmpty, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { manualCorrectionRate } from '@/features/scanner/cropStats';
import { cropLines, diagnosticsReport, DiagnosticStage, megapixels, pixelRetention, StageInfo, useScanDiagnostics } from '@/core/document-engine/image/diagnostics';

const order = ['source', 'master', 'preview', 'thumbnail'] as const satisfies readonly DiagnosticStage[];

function line(s: StageInfo) {
  const mb = s.bytes / (1024 * 1024);
  const parts = [`${s.width} × ${s.height}`, `${megapixels(s).toFixed(2)} MP`, mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(s.bytes / 1024)} KB`];
  if (s.quality) parts.push(`JPEG ${s.quality}`);
  return parts.join(' · ');
}

/** App version and device model/OS for the copied report (no identifiers). */
function deviceLine() {
  const c = Platform.constants as Record<string, unknown>;
  const device = Platform.OS === 'android' ? `${c.Manufacturer ?? ''} ${c.Model ?? ''} · Android ${c.Release ?? ''}` : `${Platform.OS} ${String(c.osVersion ?? Platform.Version)}`;
  return `OneScan ${Constants.expoConfig?.version ?? ''} · ${device.trim()}`;
}

/**
 * Pixel and file sizes of each image tier for recent pages (numbers only, in memory).
 * Shows at a glance whether anything shrank a page on its way to the master.
 */
export function ScanDiagnosticsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const pages = useScanDiagnostics((s) => s.pages);
  const clear = useScanDiagnostics((s) => s.clear);
  const toast = useToast();
  const cropStats = useSettings((s) => s.cropStats);
  const resetCropStats = useSettings((s) => s.resetCropStats);
  const rate = manualCorrectionRate(cropStats);
  const cropSummary = [
    t('scan_diagnostics.crop_counts', { auto: cropStats.auto, review: cropStats.review, accepted: cropStats.reviewAccepted, manual: cropStats.manual }),
    t('scan_diagnostics.crop_corrected', { auto: cropStats.autoCorrected, review: cropStats.reviewCorrected }),
    t('scan_diagnostics.crop_rate', { rate: rate === null ? '–' : `${Math.round(rate * 1000) / 10}%` }),
  ];
  const copy = async () => {
    await Clipboard.setStringAsync(`${diagnosticsReport(pages, deviceLine())}\n\n${cropSummary.join('\n')}`);
    toast(t('scan_diagnostics.copied'), 'success');
  };
  return (
    <TScreen scroll header={<TNavigationBar title={t('scan_diagnostics.title')} onBack={() => router.back()} />}>
      <TCellGroup title={t('scan_diagnostics.crop_title')} footer={t('scan_diagnostics.crop_footer')}>
        <View style={{ padding: spacing.md, gap: spacing.xxs }}>
          {cropSummary.map((l) => (
            <TText key={l} variant="bodySmall">
              {l}
            </TText>
          ))}
        </View>
      </TCellGroup>
      {pages.length === 0 ? (
        <TEmpty icon="info" title={t('scan_diagnostics.empty')} description={t('scan_diagnostics.empty_hint')} />
      ) : (
        pages.map((p) => {
          const retention = p.stages.source && p.stages.master ? pixelRetention(p.stages.source, p.stages.master) : null;
          const low = retention !== null && retention < 0.7 && p.profile !== 'standard';
          return (
            <TCellGroup
              key={`${p.at}-${p.page}`}
              title={`${p.page ? t('scan_diagnostics.page', { page: p.page }) : t('scan_diagnostics.captured')} · ${t('scan_diagnostics.filter')}: ${p.filter} · ${p.profile}${(p.capture?.engine ?? p.scanner) ? ` · ${p.capture?.engine ?? p.scanner}` : ''}`}
            >
              <View style={{ padding: spacing.md, gap: spacing.xxs }}>
                {order.map((k) =>
                  p.stages[k] ? (
                    <TText key={k} variant="bodySmall">
                      {`${t(`scan_diagnostics.${k}`)}: ${line(p.stages[k]!)}${p.stages[k]!.degraded ? ` · ${t('scan_diagnostics.degraded')}` : ''}`}
                    </TText>
                  ) : null,
                )}
                {p.capture ? (
                  <TText variant="bodySmall">
                    {`${t('scan_diagnostics.camera')}: ${(p.capture.tier ?? '').toUpperCase()}${p.capture.jpegQuality ? ` · JPEG ${p.capture.jpegQuality}` : ''}`}
                  </TText>
                ) : null}
                {p.timings ? (
                  <TText variant="bodySmall">
                    {t('scan_diagnostics.timings', { capture: p.timings.captureMs ?? '–', process: p.timings.processMs ?? '–' })}
                  </TText>
                ) : null}
                {p.crop
                  ? cropLines(p.crop).map((l) => (
                      <TText key={l} variant="bodySmall">
                        {l}
                      </TText>
                    ))
                  : null}
                {retention !== null ? (
                  <TText variant="bodySmall" style={{ color: low ? colors.error : colors.success }}>
                    {t('scan_diagnostics.retention', { percent: Math.round(retention * 100) })}
                  </TText>
                ) : null}
              </View>
            </TCellGroup>
          );
        })
      )}
      {pages.length ? (
        <View style={{ margin: spacing.md, gap: spacing.sm }}>
          <TButton label={t('scan_diagnostics.copy')} block onPress={copy} />
          <TButton
            label={t('scan_diagnostics.clear')}
            variant="outline"
            block
            onPress={() => {
              clear();
              resetCropStats();
            }}
          />
        </View>
      ) : null}
    </TScreen>
  );
}
