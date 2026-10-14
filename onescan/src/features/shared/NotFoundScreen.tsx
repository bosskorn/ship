import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TEmpty, TNavigationBar, TScreen } from '@/design-system';

/** Unknown link (e.g. an old or mistyped onescan:// address). */
export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <TScreen header={<TNavigationBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <TEmpty icon="info" title={t('common.not_found')} actionLabel={t('common.go_home')} onAction={() => router.replace('/')} />
    </TScreen>
  );
}
