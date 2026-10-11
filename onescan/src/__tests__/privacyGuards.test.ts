import { sanitizeAnalytics } from '@/services/analytics/sanitize';
import { prepareAiPayload, AiConsent } from '@/core/document-engine/ai/aiPolicy';
import { canUpload } from '@/core/document-engine/sync/syncPolicy';

describe('analytics sanitizer (spec §41)', () => {
  it('drops forbidden keys and free text', () => {
    const r = sanitizeAnalytics('scan_completed', {
      pages: 3,
      mode: 'receipt',
      ocr_content: 'hello',
      document_text: 'x',
      note: 'John Smith lives at 99 Road',
      ref: '1101700230705',
    });
    expect(r.props).toEqual({ pages: 3, mode: 'receipt' });
    expect(r.dropped.sort()).toEqual(['document_text', 'note', 'ocr_content', 'ref']);
  });

  it('rejects unknown events', () => {
    expect(sanitizeAnalytics('document_text', {}).ok).toBe(false);
  });
});

describe('AI policy (spec §19)', () => {
  const base = { documentId: 'd1', task: 'summary' as const, text: 'call 0812345678', now: 1000 };
  const consent = (c: Partial<AiConsent> = {}): AiConsent => ({ documentId: 'd1', task: 'summary', mode: 'redacted', originalConfirmed: false, grantedAt: 900, ...c });

  it('is denied when AI is off, even with consent', () => {
    expect(prepareAiPayload({ ...base, allowAI: false, consent: consent() })).toEqual({ ok: false, reason: 'ai_disabled' });
  });

  it('requires consent for this exact document and task', () => {
    expect(prepareAiPayload({ ...base, allowAI: true, consent: null })).toMatchObject({ reason: 'no_consent' });
    expect(prepareAiPayload({ ...base, allowAI: true, consent: consent({ documentId: 'd2' }) })).toMatchObject({ reason: 'consent_mismatch' });
  });

  it('redacts by default', () => {
    const r = prepareAiPayload({ ...base, allowAI: true, consent: consent() });
    expect(r).toMatchObject({ ok: true, payload: { content: 'call 08X-XXX-XXXX', redacted: true, redactedTypes: ['phone'] } });
  });

  it('needs a second confirmation to send the original', () => {
    expect(prepareAiPayload({ ...base, allowAI: true, consent: consent({ mode: 'original' }) })).toMatchObject({ reason: 'original_not_confirmed' });
    expect(prepareAiPayload({ ...base, allowAI: true, consent: consent({ mode: 'original', originalConfirmed: true }) })).toMatchObject({
      ok: true,
      payload: { content: 'call 0812345678', redacted: false },
    });
  });

  it('expires stale consent', () => {
    expect(prepareAiPayload({ ...base, now: 900 + 11 * 60_000, allowAI: true, consent: consent() })).toMatchObject({ reason: 'consent_expired' });
  });
});

describe('sync policy (spec §26–27)', () => {
  const on = { backupEnabled: true, provider: 'onescan' as const };
  it('blocks everything while cloud is off (default)', () => {
    expect(canUpload({ backupEnabled: false, provider: null }, true, { userInitiated: true, encrypted: true })).toEqual({ allowed: false, reason: 'cloud_off' });
  });
  it('never uploads plaintext', () => {
    expect(canUpload(on, true, { userInitiated: true, encrypted: false })).toEqual({ allowed: false, reason: 'not_encrypted' });
  });
  it('blocks background upload unless auto upload is on', () => {
    expect(canUpload(on, false, { userInitiated: false, encrypted: true })).toEqual({ allowed: false, reason: 'auto_upload_off' });
    expect(canUpload(on, false, { userInitiated: true, encrypted: true })).toEqual({ allowed: true });
  });
});
