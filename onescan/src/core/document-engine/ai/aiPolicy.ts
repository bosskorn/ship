import { detectPii, PiiType } from '../redaction/piiDetector';
import { redactText } from '../redaction/mask';

/**
 * AI is OFF by default and never reads a document without per-request consent
 * (spec §19, §57, §66.2). Provider choice is the gateway's job, not the app's.
 */
export type AiTaskId = 'summary' | 'ask' | 'translate' | 'extract_receipt' | 'extract_invoice' | 'ocr_advanced' | 'contract_analysis';

export interface AiConsent {
  documentId: string;
  task: AiTaskId;
  mode: 'redacted' | 'original';
  /** Second confirmation required for `original` (spec §19). */
  originalConfirmed: boolean;
  grantedAt: number;
}

export interface AiPayload {
  task: AiTaskId;
  documentId: string;
  content: string;
  redacted: boolean;
  redactedTypes: PiiType[];
}

export type AiPrepareResult =
  | { ok: true; payload: AiPayload }
  | { ok: false; reason: 'ai_disabled' | 'no_consent' | 'consent_mismatch' | 'original_not_confirmed' | 'consent_expired' };

const CONSENT_TTL_MS = 10 * 60 * 1000;

export function prepareAiPayload(args: {
  allowAI: boolean;
  documentId: string;
  task: AiTaskId;
  text: string;
  consent: AiConsent | null;
  now?: number;
}): AiPrepareResult {
  const { allowAI, documentId, task, text, consent } = args;
  const now = args.now ?? Date.now();
  if (!allowAI) return { ok: false, reason: 'ai_disabled' };
  if (!consent) return { ok: false, reason: 'no_consent' };
  if (consent.documentId !== documentId || consent.task !== task) return { ok: false, reason: 'consent_mismatch' };
  if (now - consent.grantedAt > CONSENT_TTL_MS) return { ok: false, reason: 'consent_expired' };
  if (consent.mode === 'original' && !consent.originalConfirmed) return { ok: false, reason: 'original_not_confirmed' };

  if (consent.mode === 'original') {
    return { ok: true, payload: { task, documentId, content: text, redacted: false, redactedTypes: [] } };
  }
  const matches = detectPii(text);
  return {
    ok: true,
    payload: {
      task,
      documentId,
      content: redactText(text, matches),
      redacted: true,
      redactedTypes: [...new Set(matches.map((m) => m.type))],
    },
  };
}
