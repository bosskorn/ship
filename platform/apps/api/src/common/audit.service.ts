import { Injectable } from '@nestjs/common';
import { DbService, Queryable } from './db.service';
import type { AuthUser } from './auth';

export interface AuditEntry {
  actor: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async log(e: AuditEntry, client?: Queryable) {
    await this.db.query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, before, after, reason, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.actor?.id ?? null,
        e.actor?.role ?? 'SYSTEM',
        e.action,
        e.entityType,
        e.entityId ?? null,
        e.before === undefined ? null : JSON.stringify(e.before),
        e.after === undefined ? null : JSON.stringify(e.after),
        e.reason ?? null,
        e.ip ?? null,
      ],
      client,
    );
  }
}
