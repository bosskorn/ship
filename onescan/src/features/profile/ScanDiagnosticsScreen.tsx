import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TButton, TCellGroup, TEmpty, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { DiagnosticStage, megapixels, pixelRetention, StageInfo, useScanDiagnostics } from '@/core/document-engine/image/diagnostics';

const order = ['source', 'master', 'preview'] as const satisfies readonly DiagnosticStage[];

function line(s: StageInfo) {
  const mb = s.bytes / (1024 * 1024);
  const parts = [`${s.width} × ${s.height}`, `${megapixels(s).toFixed(2)} MP`, mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(s.bytes / 1024)} KB`];
  if (s.quality) parts.push(`JPEG ${s.quality}`);
  return parts.join(' · ');
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
  return (
    <TScreen scroll header={<TNavigationBar title={t('scan_diagnostics.title')} onBack={() => router.back()} />}>
      {pages.length === 0 ? (
        <TEmpty icon="info" title={t('scan_diagnostics.empty')} description={t('scan_diagnostics.empty_hint')} />
      ) : (
        pages.map((p) => {
          const retention = p.stages.source && p.stages.master ? pixelRetention(p.stages.source, p.stages.master) : null;
          const low = retention !== null && retention < 0.7 && p.profile !== 'standard';
          return (
            <TCellGroup
              key={`${p.at}-${p.page}`}
              title={`${p.page ? t('scan_diagnostics.page', { page: p.page }) : t('scan_diagnostics.captured')} · ${t('scan_diagnostics.filter')}: ${p.filter} · ${p.profile}${p.scanner ? ` · ${p.scanner}` : ''}`}
            >
              <View style={{ padding: spacing.md, gap: spacing.xxs }}>
                {order.map((k) =>
                  p.stages[k] ? (
                    <TText key={k} variant="bodySmall">
                      {`${t(`scan_diagnostics.${k}`)}: ${line(p.stages[k]!)}${p.stages[k]!.degraded ? ` · ${t('scan_diagnostics.degraded')}` : ''}`}
                    </TText>
                  ) : null,
                )}
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
      {pages.length ? <TButton label={t('scan_diagnostics.clear')} variant="outline" block style={{ margin: spacing.md }} onPress={clear} /> : null}
    </TScreen>
  );
}
