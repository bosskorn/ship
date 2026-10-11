import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { LanguageCode, supportedLanguages } from '@/core/i18n/languages';

export function LanguageScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const check = <TIcon name="check" size="md" color={colors.brand} />;
  const options: { code: LanguageCode | null; label: string }[] = [
    { code: null, label: t('language.system') },
    ...supportedLanguages.map((l) => ({ code: l.code, label: l.nativeName })),
  ];
  return (
    <TScreen scroll header={<TNavigationBar title={t('language.title')} onBack={() => router.back()} />}>
      <TCellGroup>
        {options.map((o) => (
          <TCell key={o.code ?? 'system'} title={o.label} right={language === o.code ? check : undefined} onPress={() => setLanguage(o.code)} />
        ))}
      </TCellGroup>
    </TScreen>
  );
}
