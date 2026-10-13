import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TNavigationBar, TScreen } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { supportedLanguages } from '@/core/i18n/languages';

export function ProfileScreen() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const appearance = useSettings((s) => s.appearance);
  const scanQuality = useSettings((s) => s.scanner.quality);
  const langLabel = language ? supportedLanguages.find((l) => l.code === language)?.nativeName : t('language.system');
  const go = (path: Parameters<typeof router.push>[0]) => () => router.push(path);

  return (
    <TScreen scroll header={<TNavigationBar large title={t('profile.title')} />}>
      {/* v1: no account, no plans, no cloud — everything stays on this phone. */}
      <TCellGroup>
        <TCell icon="storage" title={t('profile.storage')} note={t('profile.storage_local')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="shield" title={t('profile.privacy')} arrow onPress={go('/privacy')} testID="profile-privacy" />
        <TCell icon="lock" title={t('profile.security')} arrow onPress={go('/security')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="translate" title={t('profile.language')} note={langLabel} arrow onPress={go('/language')} />
        <TCell icon="appearance" title={t('profile.appearance')} note={t(`appearance.${appearance}`)} arrow onPress={go('/appearance')} />
        <TCell icon="camera" title={t('scan_quality.title')} note={t(`scan_quality.${scanQuality}`)} arrow onPress={go('/scan-quality')} />
      </TCellGroup>

      <TCellGroup>
        <TCell icon="info" title={t('profile.about')} arrow onPress={go('/about')} />
      </TCellGroup>
    </TScreen>
  );
}
