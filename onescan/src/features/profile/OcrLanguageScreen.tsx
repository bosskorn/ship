import React from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TCellGroup, TIcon, TNavigationBar, TScreen, TText, useTheme } from '@/design-system';
import { useSettings } from '@/core/config/settingsStore';
import { availableOcrLanguages, OcrLanguageId } from '@/core/document-engine/ocr/ocrLanguages';

/** Language of the text in scanned documents — separate from the app language. */
export function OcrLanguageScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const saved = useSettings((s) => s.ocrLanguage);
  const setOcrLanguage = useSettings((s) => s.setOcrLanguage);
  const options = availableOcrLanguages();
  const selected = options.some((o) => o.id === saved) ? saved : options[0].id;
  const check = <TIcon name="check" size="md" color={colors.brand} />;
  return (
    <TScreen scroll header={<TNavigationBar title={t('ocr_language.title')} onBack={() => router.back()} />}>
      <TCellGroup>
        {options.map((o) => (
          <TCell
            key={o.id}
            title={t(o.labelKey)}
            right={selected === o.id ? check : undefined}
            selected={selected === o.id}
            onPress={() => setOcrLanguage(o.id as OcrLanguageId)}
          />
        ))}
      </TCellGroup>
      <TText variant="caption" color="textSecondary" style={{ paddingHorizontal: spacing.lg }}>
        {t('ocr_language.note')}
      </TText>
    </TScreen>
  );
}
