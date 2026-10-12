import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import type { ScanQuality } from '@/core/document-engine/image/quality';

const options: ScanQuality[] = ['standard', 'high', 'maximum'];

/** Master resolution / JPEG quality tier for saved scans (default: High). */
export function ScanQualityScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const quality = useSettings((s) => s.scanner.quality);
  const setScanner = useSettings((s) => s.setScanner);
  return (
    <TScreen scroll header={<TNavigationBar title={t('scan_quality.title')} onBack={() => router.back()} />}>
      <TCellGroup footer={t('scan_quality.footer')}>
        {options.map((o) => (
          <TCell
            key={o}
            title={o === 'high' ? `${t(`scan_quality.${o}`)} · ${t('scan_quality.recommended')}` : t(`scan_quality.${o}`)}
            description={t(`scan_quality.${o}_hint`)}
            right={quality === o ? <TIcon name="check" size="md" color={colors.brand} /> : undefined}
            onPress={() => setScanner({ quality: o })}
          />
        ))}
      </TCellGroup>
      <TCellGroup>
        <TCell icon="info" title={t('scan_diagnostics.title')} arrow onPress={() => router.push('/scan-diagnostics')} />
      </TCellGroup>
    </TScreen>
  );
}
