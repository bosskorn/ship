import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, useTheme } from '@/design-system';
import { ScannerEngineSetting, useSettings } from '@/core/config/settingsStore';
import type { ScanQuality } from '@/core/document-engine/image/quality';
import { MAX_ONESCAN_FAILURES } from '@/features/scanner/engine';

const options: ScanQuality[] = ['standard', 'high', 'maximum'];
const engines: ScannerEngineSetting[] = ['auto', 'onescan', 'google'];

/** Master resolution / JPEG quality tier for saved scans (default: High), and the scanner engine (default: Auto). */
export function ScanQualityScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const quality = useSettings((s) => s.scanner.quality);
  const setScanner = useSettings((s) => s.setScanner);
  const engine = useSettings((s) => s.scanner.engine);
  const devMode = useSettings((s) => s.devMode);
  const setHealth = useSettings((s) => s.setScannerHealth);
  const health = useSettings((s) => s.scannerHealth);
  const fellBack = engine === 'auto' && health.failures + (health.opening ? 1 : 0) >= MAX_ONESCAN_FAILURES;
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
      <TCellGroup title={t('scanner_engine.title')} footer={fellBack ? t('scanner_engine.fell_back') : undefined}>
        {engines.map((e) => (
          <TCell
            key={e}
            title={e === 'auto' ? `${t('scanner_engine.auto')} · ${t('scanner_engine.recommended')}` : t(`scanner_engine.${e}`)}
            description={t(`scanner_engine.${e}_hint`)}
            right={engine === e ? <TIcon name="check" size="md" color={colors.brand} /> : undefined}
            onPress={() => {
              setScanner({ engine: e });
              // Picking an engine again is a fresh start for the Auto crash guard.
              setHealth({ opening: false, failures: 0 });
            }}
          />
        ))}
        {fellBack ? <TCell icon="rescan" title={t('scanner_engine.retry')} arrow onPress={() => setHealth({ opening: false, failures: 0 })} /> : null}
      </TCellGroup>
      <TCellGroup>
        {devMode || __DEV__ ? <TCell icon="info" title={t('scan_diagnostics.title')} arrow onPress={() => router.push('/scan-diagnostics')} /> : null}
      </TCellGroup>
    </TScreen>
  );
}
