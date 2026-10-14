import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { directionPending, systemLanguage } from '@/core/i18n';
import { availableLanguages, LanguageCode, usableLanguage } from '@/core/i18n/languages';

/** App (UI) language. Document text recognition has its own setting: OcrLanguageScreen. */
export function LanguageScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const saved = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const language = usableLanguage(saved);
  const check = <TIcon name="check" size="md" color={colors.brand} />;
  const options: { code: LanguageCode | null; label: string }[] = [
    { code: null, label: t('language.system') },
    ...availableLanguages().map((l) => ({ code: l.code as LanguageCode, label: l.nativeName })),
  ];
  return (
    <TScreen scroll header={<TNavigationBar title={t('language.title')} onBack={() => router.back()} />}>
      <TCellGroup>
        {options.map((o) => (
          <TCell
            key={o.code ?? 'system'}
            title={o.label}
            right={language === o.code ? check : undefined}
            selected={language === o.code}
            onPress={() => setLanguage(o.code)}
          />
        ))}
      </TCellGroup>
      {/* Switching between left-to-right and right-to-left layouts applies after a restart. */}
      {directionPending(language ?? systemLanguage()) ? (
        <TText variant="caption" color="textSecondary" style={{ paddingHorizontal: spacing.lg }}>
          {t('language.restart_note')}
        </TText>
      ) : null}
    </TScreen>
  );
}
