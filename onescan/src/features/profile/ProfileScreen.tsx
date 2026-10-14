import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TScreen, TTopAppBar } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { usableLanguage, languageInfo } from '@/core/i18n/languages';
import { availableOcrLanguages } from '@/core/document-engine/ocr/ocrLanguages';

export function ProfileScreen() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const appearance = useSettings((s) => s.appearance);
  const scanQuality = useSettings((s) => s.scanner.quality);
  const usable = usableLanguage(language);
  const langLabel = usable ? languageInfo(usable).nativeName : t('language.system');
  const ocrLanguage = useSettings((s) => s.ocrLanguage);
  const ocr = availableOcrLanguages().find((l) => l.id === ocrLanguage) ?? availableOcrLanguages()[0];
  const go = (path: Parameters<typeof router.push>[0]) => () => router.push(path);

  return (
    <TScreen scroll surface="container" header={<TTopAppBar title={t('profile.title')} />}>
      {/* v1: no account, no plans, no cloud — everything stays on this phone. */}
      <TCellGroup title={t('profile.section_data')}>
        <TCell icon="storage" title={t('profile.storage')} note={t('profile.storage_local')} />
        <TCell icon="shield" title={t('profile.privacy')} arrow onPress={go('/privacy')} testID="profile-privacy" />
        <TCell icon="lock" title={t('profile.security')} arrow onPress={go('/security')} />
      </TCellGroup>

      <TCellGroup title={t('profile.section_app')}>
        <TCell icon="translate" title={t('profile.language')} note={langLabel} arrow onPress={go('/language')} />
        <TCell icon="ocr" title={t('ocr_language.title')} note={t(ocr.labelKey)} arrow onPress={go('/ocr-language')} />
        <TCell icon="appearance" title={t('profile.appearance')} note={t(`appearance.${appearance}`)} arrow onPress={go('/appearance')} />
        <TCell icon="camera" title={t('scan_quality.title')} note={t(`scan_quality.${scanQuality}`)} arrow onPress={go('/scan-quality')} />
      </TCellGroup>

      <TCellGroup title={t('profile.section_about')}>
        <TCell icon="info" title={t('profile.about')} arrow onPress={go('/about')} />
      </TCellGroup>
    </TScreen>
  );
}
