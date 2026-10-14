/**
 * Language registry — the only place that knows which app languages exist.
 *
 * To add a language: add `locales/<code>.ts` (same keys as en.ts; missing keys fall back to
 * English), register it in `locales/index.ts`, and add an entry here with `status: 'preview'`.
 * Preview languages appear only in development builds; set `status: 'production'` once the
 * translation is complete and has passed QA. No other code changes are needed — direction
 * (RTL), date/number formats and the language picker all read this registry.
 *
 * App language (UI) is independent of OCR language (document text): see ocrLanguages.ts.
 */
export interface LanguageInfo {
  /** BCP-47 code used as the resource key, e.g. 'th', 'zh-Hans', 'pt-BR'. */
  code: string;
  /** Name in the language itself (shown in the picker). */
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
  /** Locale for Intl dates/numbers (calendar, digits, separators). */
  intlLocale: string;
  /** 'production' = complete and QA-passed (shown in release builds); 'preview' = dev builds only. */
  status: 'production' | 'preview';
  /** Extra device-locale tags that should pick this language (e.g. zh-TW → zh-Hant). */
  matches?: string[];
}

export const languageRegistry = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', intlLocale: 'en-GB', status: 'production' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', dir: 'ltr', intlLocale: 'th-TH', status: 'production' },
  // Development-only pseudo-locale: every English string accented and ~40% longer, to find
  // clipped text, fixed widths and strings that bypass translation.
  { code: 'en-XA', nativeName: 'Ēñğļîšħ (pseudo)', englishName: 'Pseudo-locale', dir: 'ltr', intlLocale: 'en-GB', status: 'preview' },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof languageRegistry)[number]['code'];
export const fallbackLanguage: LanguageCode = 'en';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

/** Languages offered in this build (production ones; preview ones too in development builds). */
export function availableLanguages(dev: boolean = isDev): readonly LanguageInfo[] {
  return languageRegistry.filter((l) => l.status === 'production' || dev);
}

/** Kept for existing callers: the languages offered in this build. */
export const supportedLanguages = availableLanguages();

export function languageInfo(code: string): LanguageInfo {
  return (languageRegistry as readonly LanguageInfo[]).find((l) => l.code === code) ?? languageRegistry[0];
}

/**
 * Best available language for the device's preferred locales (most preferred first):
 * exact tag (zh-Hant-TW → zh-Hant), then extra matches, then the base language
 * (pt-PT → pt); otherwise English.
 */
export function resolveLanguage(preferred: readonly string[], dev: boolean = isDev): LanguageCode {
  const langs = availableLanguages(dev);
  for (const tag of preferred) {
    const t = tag.toLowerCase().replace(/_/g, '-');
    const exact = langs.find((l) => t === l.code.toLowerCase() || t.startsWith(`${l.code.toLowerCase()}-`) || l.matches?.some((m) => t.startsWith(m.toLowerCase())));
    if (exact) return exact.code as LanguageCode;
    const base = langs.find((l) => l.code.toLowerCase() === t.split('-')[0]);
    if (base) return base.code as LanguageCode;
  }
  return fallbackLanguage;
}

/** A stored choice that is no longer offered (removed or preview-only) falls back to the system language. */
export function usableLanguage(code: string | null | undefined, dev: boolean = isDev): LanguageCode | null {
  return code && availableLanguages(dev).some((l) => l.code === code) ? (code as LanguageCode) : null;
}
