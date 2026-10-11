/** Languages shipped in this build. Add a locale file + entry here to expand. */
export const supportedLanguages = [
  { code: 'en', nativeName: 'English' },
  { code: 'th', nativeName: 'ไทย' },
] as const;

export type LanguageCode = (typeof supportedLanguages)[number]['code'];
export const fallbackLanguage: LanguageCode = 'en';

export function resolveLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    const match = supportedLanguages.find((l) => l.code === base);
    if (match) return match.code;
  }
  return fallbackLanguage;
}
