import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TNavigationBar, TScreen, TSwitch, TTag } from '@/design-system';
import { useFeature } from '@/core/config/remoteConfig';

/** Cloud is optional and OFF by default; bring-your-own-cloud supported (spec §26). */
export function CloudScreen() {
  const { t } = useTranslation();
  const cloud = useFeature('cloudBackup');
  const external = useFeature('externalCloud');
  const providers = [
    { key: 'onescan_cloud', enabled: cloud },
    { key: 'google_drive', enabled: external },
    { key: 'onedrive', enabled: external },
    { key: 'dropbox', enabled: external },
    { key: 'webdav', enabled: external },
  ] as const;
  return (
    <TScreen scroll header={<TNavigationBar title={t('cloud.title')} onBack={() => router.back()} />}>
      <TCellGroup footer={cloud ? undefined : t('common.comingSoon')}>
        <TCell title={t('cloud.backup')} description={t('cloud.backup_desc')} right={<TSwitch value={false} disabled={!cloud} onValueChange={() => router.push('/unavailable')} />} />
      </TCellGroup>
      <TCellGroup title={t('cloud.providers')} footer={t('cloud.byoc')}>
        {providers.map((p) => (
          <TCell key={p.key} icon="cloud" title={t(`cloud.${p.key}`)} disabled={!p.enabled} right={p.enabled ? undefined : <TTag label={t('common.off')} />} />
        ))}
      </TCellGroup>
    </TScreen>
  );
}
