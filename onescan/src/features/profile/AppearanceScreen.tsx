import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, useTheme } from '@/design-system';
import { AppearancePreference, useSettings } from '@/core/config/settingsStore';

export function AppearanceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const options: AppearancePreference[] = ['system', 'light', 'dark'];
  return (
    <TScreen scroll header={<TNavigationBar title={t('appearance.title')} onBack={() => router.back()} />}>
      <TCellGroup>
        {options.map((o) => (
          <TCell key={o} title={t(`appearance.${o}`)} right={appearance === o ? <TIcon name="check" size="md" color={colors.brand} /> : undefined} onPress={() => setAppearance(o)} />
        ))}
      </TCellGroup>
    </TScreen>
  );
}
