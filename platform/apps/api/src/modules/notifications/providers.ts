import { Logger } from '@nestjs/common';

export interface PushMessage {
  to: string; // device push token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android channel / iOS category, e.g. "job-offer" uses a loud sound. */
  channel?: string;
  ttlSeconds?: number;
}

export interface PushSender {
  readonly name: string;
  send(messages: PushMessage[]): Promise<void>;
}

export interface SmsSender {
  readonly name: string;
  send(phone: string, text: string): Promise<void>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
export const SMS_SENDER = Symbol('SMS_SENDER');

export class LogPushSender implements PushSender {
  readonly name = 'log';
  private readonly logger = new Logger('Push');
  async send(messages: PushMessage[]) {
    for (const m of messages) this.logger.log(`[push] ${m.title} — ${m.body}`);
  }
}

/** Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export class ExpoPushSender implements PushSender {
  readonly name = 'expo';
  constructor(private readonly accessToken?: string) {}
  async send(messages: PushMessage[]) {
    if (!messages.length) return;
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data ?? {},
        channelId: m.channel,
        ttl: m.ttlSeconds,
        priority: 'high',
        sound: 'default',
      }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
    }
  }
}

/** Placeholder until a Thai SMS gateway (e.g. ThaiBulkSMS) adapter is added. */
export class LogSmsSender implements SmsSender {
  readonly name = 'log';
  private readonly logger = new Logger('SMS');
  async send(phone: string, text: string) {
    const masked = phone.replace(/\d(?=\d{4})/g, '•');
    this.logger.log(`[sms] to ${masked}: ${text.replace(/\d{6}/, '••••••')}`);
  }
}
