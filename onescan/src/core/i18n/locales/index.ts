import en from './en';
import th from './th';
import { pseudoLocalize } from './pseudo';

/**
 * Translation resources by language code (see ../languages.ts). A resource may be partial:
 * any missing key falls back to English at runtime, so a new language can ship screen by
 * screen in development builds before it is marked production-ready.
 */
export type TranslationResource = typeof en;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const resources: Record<string, DeepPartial<TranslationResource>> = {
  en,
  th,
  'en-XA': pseudoLocalize(en),
};
