/**
 * Product analytics schema. Events describe *what the user did*, never
 * *what the document contains* (spec §41, §66.11).
 */
export const analyticsEvents = [
  'app_opened',
  'onboarding_completed',
  'scan_started',
  'scan_completed',
  'scan_cancelled',
  'page_captured',
  'import_started',
  'ocr_used',
  'pdf_exported',
  'document_shared',
  'search_used',
  'sensitive_detected',
  'redaction_applied',
  'ai_clicked',
  'ai_consent_shown',
  'ai_consent_result',
  'cloud_enabled',
  'pro_started',
  'settings_changed',
] as const;

export type AnalyticsEvent = (typeof analyticsEvents)[number];

/** Primitive, low-cardinality values only. */
export type AnalyticsValue = string | number | boolean;
export type AnalyticsProps = Record<string, AnalyticsValue>;

/** Keys that must never appear, regardless of value. */
export const forbiddenPropKeys = [
  'document_text',
  'ocr_content',
  'ocr_text',
  'text',
  'content',
  'id_number',
  'national_id',
  'passport',
  'bank_account',
  'credit_card',
  'document_image',
  'image',
  'file_name',
  'filename',
  'title',
  'query',
  'email',
  'phone',
  'address',
  'signature',
] as const;
