import { randomUUID } from 'crypto';
import type { PaymentMethod, Satang } from '@ship/shared';

export interface InitiateResult {
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  providerRef: string | null;
  /** Data the client needs to complete payment (QR payload, 3DS URL...). */
  clientData: Record<string, unknown>;
}

export interface WebhookResult {
  providerRef: string;
  status: 'CAPTURED' | 'AUTHORIZED' | 'FAILED';
  raw: unknown;
}

/**
 * Gateway abstraction (spec §32). Order code never imports a gateway SDK; adding Omise,
 * 2C2P, GB Prime Pay, etc. means adding an adapter here.
 */
export interface PaymentAdapter {
  readonly provider: string;
  readonly methods: PaymentMethod[];
  initiate(input: { paymentId: string; orderNo: string; amount: Satang }): Promise<InitiateResult>;
  capture(input: { providerRef: string | null; amount: Satang }): Promise<{ ok: boolean }>;
  refund(input: { providerRef: string | null; amount: Satang }): Promise<{ ok: boolean }>;
  /** Verify signature and parse a provider callback. Return null when not valid. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, body: any): Promise<WebhookResult | null>;
}

/** Cash: nothing to do online; the driver collects at the configured stop. */
export class CashAdapter implements PaymentAdapter {
  readonly provider = 'cash';
  readonly methods: PaymentMethod[] = ['CASH'];
  async initiate(): Promise<InitiateResult> {
    return { status: 'PENDING', providerRef: null, clientData: {} };
  }
  async capture() {
    return { ok: true };
  }
  async refund() {
    return { ok: true };
  }
  async parseWebhook() {
    return null;
  }
}

/**
 * Development stand-in for a PromptPay QR gateway. Produces a fake payload and accepts
 * a shared-secret webhook so the full PAYMENT_PENDING -> paid flow can be exercised.
 */
export class MockQrAdapter implements PaymentAdapter {
  readonly provider = 'mock-qr';
  readonly methods: PaymentMethod[] = ['QR'];
  constructor(private readonly webhookSecret: string) {}
  async initiate(input: { paymentId: string; orderNo: string; amount: Satang }): Promise<InitiateResult> {
    const ref = `mockqr_${randomUUID()}`;
    return {
      status: 'PENDING',
      providerRef: ref,
      clientData: { qrPayload: `MOCK-PROMPTPAY|${input.orderNo}|${(input.amount / 100).toFixed(2)}|${ref}`, expiresInSec: 600 },
    };
  }
  async capture() {
    return { ok: true };
  }
  async refund() {
    return { ok: true };
  }
  async parseWebhook(headers: Record<string, string | string[] | undefined>, body: any): Promise<WebhookResult | null> {
    if (headers['x-mock-signature'] !== this.webhookSecret) return null;
    if (!body?.providerRef) return null;
    return { providerRef: body.providerRef, status: body.status === 'FAILED' ? 'FAILED' : 'CAPTURED', raw: body };
  }
}

/** Development stand-in for a card gateway: authorises immediately, captures on delivery. */
export class MockCardAdapter implements PaymentAdapter {
  readonly provider = 'mock-card';
  readonly methods: PaymentMethod[] = ['CARD'];
  async initiate(): Promise<InitiateResult> {
    return { status: 'AUTHORIZED', providerRef: `mockcard_${randomUUID()}`, clientData: {} };
  }
  async capture() {
    return { ok: true };
  }
  async refund() {
    return { ok: true };
  }
  async parseWebhook() {
    return null;
  }
}

export const PAYMENT_ADAPTERS = Symbol('PAYMENT_ADAPTERS');
