import { useSettings } from '@/core/config/settingsStore';
import { AnalyticsEvent, AnalyticsProps } from './events';
import { sanitizeAnalytics } from './sanitize';

export interface AnalyticsTransport {
  send(event: AnalyticsEvent, props: AnalyticsProps, at: number): void;
}

/** Default transport discards events. A backend transport is plugged in when one exists. */
const noopTransport: AnalyticsTransport = { send: () => {} };
let transport: AnalyticsTransport = noopTransport;

export function setAnalyticsTransport(t: AnalyticsTransport) {
  transport = t;
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  if (!useSettings.getState().privacy.usageAnalytics) return;
  const res = sanitizeAnalytics(event, props);
  if (!res.ok) return;
  if (__DEV__ && res.dropped.length) {
    console.warn(`[analytics] dropped unsafe props on ${event}: ${res.dropped.join(', ')}`);
  }
  transport.send(event, res.props, Date.now());
}
