/**
 * OCR language registry — which scripts OCR reads in document images.
 *
 * Independent of the app (UI) language: a Thai-speaking user may scan English contracts and
 * vice versa, so changing the UI language never changes OCR, and OCR has its own setting.
 *
 * `auto` is the default: the bundled Thai+English pack, which reads Thai, English and mixed
 * Thai/English pages in one pass, so no per-page detection is needed for the shipped
 * languages. Packs for other scripts are meant to be downloaded on demand (`source:
 * 'download'`) rather than bundled, to keep the app small; none ships yet. Recognition always
 * runs on the device — document images are never sent to a cloud OCR or translation service.
 */
export interface OcrLanguage {
  id: string;
  /** Languages passed to the native recognizer (first match picks the engine). */
  languages: readonly string[];
  /** Translation key for the name shown in settings. */
  labelKey: 'ocr_language.auto' | 'ocr_language.th_en' | 'ocr_language.latin';
  /** 'bundled' = inside the app; 'download' = future on-demand pack. */
  source: 'bundled' | 'download';
  /** 'production' = QA-passed; 'preview' = development builds only. */
  status: 'production' | 'preview';
}

export const ocrLanguageRegistry = [
  { id: 'auto', languages: ['th', 'en'], labelKey: 'ocr_language.auto', source: 'bundled', status: 'production' },
  { id: 'th+en', languages: ['th', 'en'], labelKey: 'ocr_language.th_en', source: 'bundled', status: 'production' },
  // ML Kit Latin recognizer (already in the app): faster for Latin-only pages; not yet QA'd.
  { id: 'latin', languages: ['en'], labelKey: 'ocr_language.latin', source: 'bundled', status: 'preview' },
] as const satisfies readonly OcrLanguage[];

export type OcrLanguageId = (typeof ocrLanguageRegistry)[number]['id'];
export const defaultOcrLanguage: OcrLanguageId = 'auto';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

export function availableOcrLanguages(dev: boolean = isDev): readonly OcrLanguage[] {
  return ocrLanguageRegistry.filter((l) => l.status === 'production' || dev);
}

/** Recognizer languages for a saved choice; unknown or unavailable choices use `auto`. */
export function ocrLanguagesFor(id: string | null | undefined, dev: boolean = isDev): readonly string[] {
  const all = availableOcrLanguages(dev);
  return (all.find((l) => l.id === id) ?? all[0]).languages;
}

// The current choice, kept in sync from settings by AppProviders so the engine has no UI deps.
let current: string = defaultOcrLanguage;
export function setOcrLanguage(id: string | null | undefined) {
  current = id ?? defaultOcrLanguage;
}
export function currentOcrLanguages(): string[] {
  return [...ocrLanguagesFor(current)];
}
