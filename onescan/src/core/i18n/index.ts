import i18n, { changeLanguage, use as useI18nPlugin } from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { resources } from './locales';
import en from './locales/en';
import { fallbackLanguage, languageInfo, LanguageCode, resolveLanguage } from './languages';

export * from './languages';

export function systemLanguage(): LanguageCode {
  return resolveLanguage(getLocales().map((l) => l.languageTag));
}

/** English text for a key ('' if none): last-resort so a raw key is never shown. */
function englishFor(key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), en);
  return typeof v === 'string' ? v : '';
}

/** Synchronous with bundled resources; safe to call once before first render. */
export function initI18n(language: LanguageCode) {
  if (i18n.isInitialized) return i18n;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- i18next plugin registration, not a React hook
  void useI18nPlugin(initReactI18next).init({
    resources: Object.fromEntries(Object.entries(resources).map(([code, r]) => [code, { translation: r }])),
    lng: language,
    // Any key missing in a language falls back to English.
    fallbackLng: fallbackLanguage,
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    // A key missing everywhere shows English or nothing — never "screen.some_key".
    parseMissingKeyHandler: (key: string) => englishFor(key),
  });
  applyDirection(language);
  return i18n;
}

export function setLanguage(language: LanguageCode) {
  if (i18n.language !== language) void changeLanguage(language);
  applyDirection(language);
}

/**
 * Right-to-left layout for RTL languages (Arabic, Hebrew, Persian, Urdu…). React Native
 * applies a direction change after the app restarts; `directionPending` tells the UI to say so.
 */
export function applyDirection(language: LanguageCode) {
  const rtl = languageInfo(language).dir === 'rtl';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

/** True when the chosen language's direction differs from the running layout (restart needed). */
export function directionPending(language: LanguageCode): boolean {
  return (languageInfo(language).dir === 'rtl') !== I18nManager.isRTL;
}

export { i18n };
