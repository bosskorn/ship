import { analyticsEvents, AnalyticsEvent, AnalyticsProps, forbiddenPropKeys } from './events';

const SAFE_STRING = /^[a-z0-9_.:-]{0,48}$/i;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const forbidden = new Set<string>(forbiddenPropKeys);

export interface SanitizeResult {
  ok: boolean;
  props: AnalyticsProps;
  dropped: string[];
}

/**
 * Defense in depth: even if a caller passes free text, it is dropped.
 * Strings must look like enum values (e.g. "receipt", "auto"), not prose,
 * numbers must be finite, and keys must not be on the forbidden list.
 */
export function sanitizeAnalytics(event: string, props: Record<string, unknown> = {}): SanitizeResult {
  if (!(analyticsEvents as readonly string[]).includes(event)) {
    return { ok: false, props: {}, dropped: Object.keys(props) };
  }
  const clean: AnalyticsProps = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const k = key.toLowerCase();
    const keyOk = SAFE_KEY.test(k) && !forbidden.has(k) && ![...forbidden].some((f) => k.includes(f));
    const valueOk =
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && SAFE_STRING.test(value) && !/\d{6,}/.test(value));
    if (keyOk && valueOk) clean[k] = value as AnalyticsProps[string];
    else dropped.push(key);
  }
  return { ok: true, props: clean, dropped };
}

export function isKnownEvent(e: string): e is AnalyticsEvent {
  return (analyticsEvents as readonly string[]).includes(e);
}
