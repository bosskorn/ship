import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { env } from '@/core/config/env';

export function AboutScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <TScreen scroll header={<TNavigationBar title={t('about.title')} onBack={() => router.back()} />}>
      <View style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl }}>
        <TIcon name="scan" size={40} color={colors.brand} />
        <TText variant="titleLarge">OneScan</TText>
        <TText variant="body" color="textSecondary" align="center" style={{ paddingHorizontal: spacing.xxl }}>
          {t('about.tagline')}
        </TText>
      </View>
      <TCellGroup>
        <TCell title={t('about.version')} note={env.appVersion} />
      </TCellGroup>
    </TScreen>
  );
}
