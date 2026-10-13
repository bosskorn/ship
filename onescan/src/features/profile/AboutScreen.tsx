import React, { useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TText, useTheme, useToast } from '@/design-system';
import { env } from '@/core/config/env';
import { useSettings } from '@/core/config/settingsStore';

export function AboutScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const taps = useRef(0);
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
        <TCell
          title={t('about.version')}
          note={env.appVersion}
          onPress={() => {
            taps.current += 1;
            if (taps.current < 7) return;
            taps.current = 0;
            const on = !useSettings.getState().devMode;
            useSettings.getState().setDevMode(on);
            toast(t(on ? 'about.dev_on' : 'about.dev_off'));
          }}
        />
      </TCellGroup>
    </TScreen>
  );
}
