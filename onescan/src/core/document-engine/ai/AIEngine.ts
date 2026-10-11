import { apiClient } from '@/core/networking/apiClient';
import { AiConsent, AiTaskId, prepareAiPayload } from './aiPolicy';

export * from './aiPolicy';

export interface AiResult {
  output: string;
  creditsCharged: number;
}

export class AiDeniedError extends Error {}

/**
 * Talks only to the OneScan AI Gateway (spec §38). The gateway applies policy,
 * routes to a model by task/cost, meters credits, and does not log content.
 */
export const AIEngine = {
  async run(args: {
    allowAI: boolean;
    documentId: string;
    task: AiTaskId;
    text: string;
    consent: AiConsent | null;
    question?: string;
    locale: string;
  }): Promise<AiResult> {
    const prepared = prepareAiPayload(args);
    if (!prepared.ok) throw new AiDeniedError(prepared.reason);
    return apiClient.post<AiResult>('/v1/ai/run', {
      task: prepared.payload.task,
      content: prepared.payload.content,
      redacted: prepared.payload.redacted,
      question: args.question,
      locale: args.locale,
    });
  },
};
