/**
 * Analytics (spec §65). Event names are a closed union so typos fail typecheck.
 * Plug a real sink (Amplitude, Segment, Firebase…) via setAnalyticsSink.
 */
export type AnalyticsEvent =
  | 'app_open'
  | 'search_service'
  | 'select_service'
  | 'start_booking'
  | 'booking_abandon'
  | 'order_created'
  | 'technician_search_started'
  | 'technician_matched'
  | 'technician_arrived'
  | 'quote_created'
  | 'quote_approved'
  | 'work_started'
  | 'work_completed'
  | 'payment_success'
  | 'review_submitted'
  | 'warranty_requested';

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;
type Sink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

let sink: Sink = (event, props) => {
  if (__DEV__) console.log(`[analytics] ${event}`, props);
};

export function setAnalyticsSink(next: Sink) {
  sink = next;
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  try {
    sink(event, { ...props, ts: Date.now() });
  } catch {
    // Analytics must never break the product.
  }
}
