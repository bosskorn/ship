import { Inject, Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { PUSH_SENDER, PushSender, SMS_SENDER, SmsSender } from './providers';

export type NotificationEventName =
  | 'DRIVER_FOUND'
  | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED_PICKUP'
  | 'PICKED_UP'
  | 'NEAR_DESTINATION'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'NO_DRIVER'
  | 'PAYMENT_FAILED'
  | 'JOB_OFFER'
  | 'KYC_DECISION';

export interface NotifyInput {
  userId: string;
  event: NotificationEventName;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: ('PUSH' | 'SMS' | 'INAPP')[];
  pushChannel?: string;
}

/**
 * Delivery-agnostic notification service (spec §35). Business modules never talk to
 * push/SMS providers directly; they emit domain events which NotificationsListener maps here.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DbService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async notify(n: NotifyInput) {
    const channels = n.channels ?? ['PUSH'];
    for (const channel of channels) {
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO notifications (user_id, channel, event, title, body, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [n.userId, channel, n.event, n.title, n.body, JSON.stringify(n.data ?? {})],
      );
      try {
        if (channel === 'PUSH') {
          const tokens = await this.db.query<{ push_token: string }>(
            `SELECT DISTINCT push_token FROM device_sessions
              WHERE user_id = $1 AND revoked_at IS NULL AND push_token IS NOT NULL AND expires_at > now()`,
            [n.userId],
          );
          if (!tokens.length) {
            await this.mark(row!.id, 'SKIPPED', 'no push token');
            continue;
          }
          await this.push.send(
            tokens.map((t) => ({ to: t.push_token, title: n.title, body: n.body, data: n.data, channel: n.pushChannel })),
          );
        } else if (channel === 'SMS') {
          const u = await this.db.one<{ phone: string | null }>('SELECT phone FROM users WHERE id = $1', [n.userId]);
          if (!u?.phone) {
            await this.mark(row!.id, 'SKIPPED', 'no phone');
            continue;
          }
          await this.sms.send(u.phone, `${n.title}: ${n.body}`);
        }
        await this.mark(row!.id, 'SENT');
      } catch (e) {
        this.logger.warn(`notification ${n.event} via ${channel} failed: ${(e as Error).message}`);
        await this.mark(row!.id, 'FAILED', (e as Error).message);
      }
    }
  }

  /** Raw SMS (OTP). Not stored with content. */
  async sendSms(phone: string, text: string) {
    await this.sms.send(phone, text);
  }

  private async mark(id: string, status: string, error?: string) {
    await this.db.query(
      `UPDATE notifications SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'SENT' THEN now() END WHERE id = $1`,
      [id, status, error ?? null],
    );
  }
}
