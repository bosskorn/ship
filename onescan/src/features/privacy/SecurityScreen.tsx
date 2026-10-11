import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TNavigationBar, TScreen, TSwitch } from '@/design-system';
import { useFeature } from '@/core/config/remoteConfig';
import { useSettings } from '@/core/config/settingsStore';

/** Security Center (spec §30). App Lock ships in V1.1 behind the `appLock` flag. */
export function SecurityScreen() {
  const { t } = useTranslation();
  const enabled = useFeature('appLock');
  const security = useSettings((s) => s.security);
  const setSecurity = useSettings((s) => s.setSecurity);
  const footer = enabled ? undefined : t('common.comingSoon');

  return (
    <TScreen scroll header={<TNavigationBar title={t('security.title')} onBack={() => router.back()} />}>
      <TCellGroup footer={footer}>
        <TCell title={t('security.app_lock')} right={<TSwitch value={security.appLock} disabled={!enabled} onValueChange={(v) => setSecurity({ appLock: v })} />} />
        <TCell title={t('security.biometric')} right={<TSwitch value={security.biometric} disabled={!enabled || !security.appLock} onValueChange={(v) => setSecurity({ biometric: v })} />} />
        <TCell title={t('security.pin')} arrow disabled={!enabled} onPress={() => router.push('/unavailable')} />
        <TCell title={t('security.auto_lock')} note={t(`security.auto_lock_${security.autoLock === 'immediately' ? 'immediately' : security.autoLock}`)} disabled={!enabled} />
        <TCell title={t('security.screenshot')} right={<TSwitch value={security.screenshotProtection} disabled={!enabled} onValueChange={(v) => setSecurity({ screenshotProtection: v })} />} />
      </TCellGroup>
      <TCellGroup footer={t('common.comingSoon')}>
        <TCell title={t('security.encrypted_docs')} disabled />
        <TCell title={t('security.trusted_devices')} disabled />
        <TCell title={t('security.sessions')} disabled />
      </TCellGroup>
    </TScreen>
  );
}
