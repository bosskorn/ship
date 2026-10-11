import i18n, { changeLanguage, use as useI18nPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en';
import th from './locales/th';
import { fallbackLanguage, LanguageCode, resolveLanguage } from './languages';

export * from './languages';

export function systemLanguage(): LanguageCode {
  return resolveLanguage(getLocales().map((l) => l.languageTag));
}

/** Synchronous with bundled resources; safe to call once before first render. */
export function initI18n(language: LanguageCode) {
  if (i18n.isInitialized) return i18n;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- i18next plugin registration, not a React hook
  void useI18nPlugin(initReactI18next).init({
    resources: { en: { translation: en }, th: { translation: th } },
    lng: language,
    fallbackLng: fallbackLanguage,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export function setLanguage(language: LanguageCode) {
  if (i18n.language !== language) void changeLanguage(language);
}

export { i18n };
