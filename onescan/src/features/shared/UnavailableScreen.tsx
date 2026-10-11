import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TEmpty, TNavigationBar, TScreen } from '@/design-system';

/** Landing for routes registered in the spec but not shipped in this release. */
export function UnavailableScreen() {
  const { t } = useTranslation();
  return (
    <TScreen header={<TNavigationBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <TEmpty icon="info" title={t('common.comingSoon')} />
    </TScreen>
  );
}
