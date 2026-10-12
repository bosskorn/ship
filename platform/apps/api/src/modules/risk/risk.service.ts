import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService, Queryable } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { DomainEvent, OpsAlertEvent } from '../../common/events';

export type RiskType =
  | 'GPS_MOCKED'
  | 'IMPOSSIBLE_TRAVEL'
  | 'GEOFENCE_OVERRIDE'
  | 'MULTIPLE_DEVICES'
  | 'REPEATED_CANCELLATION'
  | 'POD_SUSPICIOUS'
  | 'ABNORMAL_EARNINGS'
  | 'PROMO_ABUSE'
  | 'ACCOUNT_SHARING';

/** Score at which ops are alerted. Nothing is auto-banned (spec §31): humans review. */
const ALERT_THRESHOLD = 60;

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly db: DbService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  async record(
    e: { type: RiskType; userId: string | null; orderId?: string | null; score: number; details?: Record<string, unknown> },
    client?: Queryable,
  ) {
    await this.db.query(
      `INSERT INTO risk_events (type, user_id, order_id, score, details) VALUES ($1,$2,$3,$4,$5)`,
      [e.type, e.userId, e.orderId ?? null, e.score, JSON.stringify(e.details ?? {})],
      client,
    );
    if (e.userId) {
      // rolling 30-day score, cached on the driver row for dispatch/ops screens
      await this.db.query(
        `UPDATE drivers SET risk_score = (
            SELECT coalesce(sum(score), 0) FROM risk_events
             WHERE user_id = $1 AND status IN ('OPEN','ACTIONED') AND created_at > now() - interval '30 days')
          WHERE id = $1`,
        [e.userId],
        client,
      );
    }
    this.logger.warn(`risk ${e.type} user=${e.userId} order=${e.orderId ?? '-'} score=${e.score}`);
    if (e.score >= ALERT_THRESHOLD) {
      const alert: OpsAlertEvent = {
        kind: 'RISK',
        driverId: e.userId ?? undefined,
        orderId: e.orderId ?? undefined,
        message: `${e.type} (score ${e.score})`,
        at: new Date().toISOString(),
      };
      this.events.emit(DomainEvent.OPS_ALERT, alert);
    }
  }

  async list(status: string | undefined, limit = 100) {
    return this.db.query(
      `SELECT r.*, u.phone, d.first_name, d.last_name FROM risk_events r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN drivers d ON d.id = r.user_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC LIMIT $2`,
      [status ?? null, limit],
    );
  }

  async review(id: string, decision: 'REVIEWED' | 'DISMISSED' | 'ACTIONED', note: string, actor: AuthUser) {
    await this.db.tx(async (c) => {
      const before = await this.db.one('SELECT * FROM risk_events WHERE id = $1 FOR UPDATE', [id], c);
      if (!before) throw NotFound('Risk event');
      await this.db.query(
        `UPDATE risk_events SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
        [id, decision, note, actor.id],
        c,
      );
      if (before.user_id) {
        await this.db.query(
          `UPDATE drivers SET risk_score = (
              SELECT coalesce(sum(score), 0) FROM risk_events
               WHERE user_id = $1 AND status IN ('OPEN','ACTIONED') AND created_at > now() - interval '30 days')
            WHERE id = $1`,
          [before.user_id],
          c,
        );
      }
      await this.audit.log({ actor, action: 'risk.review', entityType: 'risk_event', entityId: id, before, after: { decision, note } }, c);
    });
  }
}
