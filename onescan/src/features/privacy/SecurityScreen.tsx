import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TNavigationBar, TScreen, TSwitch } from '@/design-system';
import { useFeature } from '@/core/config/remoteConfig';
import { useSettings } from '@/core/config/settingsStore';

/**
 * Security Center (spec §30). Documents are always encrypted on the device; App Lock
 * appears only when its `appLock` flag is on (not part of v1).
 */
export function SecurityScreen() {
  const { t } = useTranslation();
  const appLock = useFeature('appLock');
  const security = useSettings((s) => s.security);
  const setSecurity = useSettings((s) => s.setSecurity);

  return (
    <TScreen scroll header={<TNavigationBar title={t('security.title')} onBack={() => router.back()} />}>
      <TCellGroup footer={t('security.encrypted_docs_footer')}>
        <TCell title={t('security.encrypted_docs')} note={t('security.on')} />
      </TCellGroup>
      {appLock ? (
        <TCellGroup>
          <TCell title={t('security.app_lock')} right={<TSwitch value={security.appLock} onValueChange={(v) => setSecurity({ appLock: v })} />} />
          <TCell title={t('security.biometric')} right={<TSwitch value={security.biometric} disabled={!security.appLock} onValueChange={(v) => setSecurity({ biometric: v })} />} />
          <TCell title={t('security.pin')} arrow onPress={() => router.push('/unavailable')} />
          <TCell title={t('security.auto_lock')} note={t(`security.auto_lock_${security.autoLock === 'immediately' ? 'immediately' : security.autoLock}`)} />
          <TCell title={t('security.screenshot')} right={<TSwitch value={security.screenshotProtection} onValueChange={(v) => setSecurity({ screenshotProtection: v })} />} />
        </TCellGroup>
      ) : null}
    </TScreen>
  );
}
