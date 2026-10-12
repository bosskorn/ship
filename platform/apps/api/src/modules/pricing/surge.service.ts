import { Injectable, Logger } from '@nestjs/common';
import { VEHICLE_TYPES, VehicleType } from '@ship/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { AppError } from '../../common/errors';
import { SettingsService } from '../settings/settings.service';
import { computeSurge } from './surge.engine';

@Injectable()
export class SurgeService {
  private readonly logger = new Logger(SurgeService.name);

  constructor(
    private readonly db: DbService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Recompute surge for every active zone × vehicle type. Run every minute by the maintenance worker. */
  async tick(now = new Date()) {
    const settings = await this.settings.get();
    const rows = await this.db.query<{ zone_id: string; vehicle_type: VehicleType; demand: string; supply: string }>(
      `WITH z AS (SELECT id, area, unnest(vehicle_types) AS vehicle_type FROM service_zones WHERE active),
       d AS (
         SELECT o.zone_id, o.vehicle_type, count(*) AS n FROM orders o
          WHERE o.status IN ('SEARCHING_DRIVER','NO_DRIVER')
             OR (o.created_at > now() - interval '15 minutes' AND o.status NOT IN ('CANCELLED','QUOTED','PAYMENT_PENDING'))
          GROUP BY 1, 2),
       s AS (
         SELECT z.id AS zone_id, v.type AS vehicle_type, count(*) AS n
           FROM drivers dr
           JOIN vehicles v ON v.id = dr.current_vehicle_id
           JOIN driver_locations l ON l.driver_id = dr.id AND l.updated_at > now() - interval '3 minutes'
           JOIN service_zones z ON z.active AND ST_Intersects(z.area, l.location::geometry)
          WHERE dr.presence = 'ONLINE'
          GROUP BY 1, 2)
       SELECT z.id AS zone_id, z.vehicle_type, coalesce(d.n, 0) AS demand, coalesce(s.n, 0) AS supply
         FROM z
         LEFT JOIN d ON d.zone_id = z.id AND d.vehicle_type = z.vehicle_type
         LEFT JOIN s ON s.zone_id = z.id AND s.vehicle_type = z.vehicle_type`,
    );
    let changed = 0;
    for (const r of rows) {
      const demand = Number(r.demand);
      const supply = Number(r.supply);
      const state = await this.db.one<{ milli: number; changed_at: Date; manual: boolean; manual_until: Date | null }>(
        'SELECT milli, changed_at, manual, manual_until FROM surge_states WHERE zone_id = $1 AND vehicle_type = $2',
        [r.zone_id, r.vehicle_type],
      );
      if (state?.manual && (!state.manual_until || state.manual_until > now)) continue;
      const current = state?.milli ?? 1000;
      const next = computeSurge({
        demand,
        supply,
        currentMilli: current,
        changedAt: state && !state.manual ? state.changed_at : new Date(0),
        now,
        settings: settings.surge,
      });
      if (next === null) {
        await this.db.query(
          `INSERT INTO surge_states (zone_id, vehicle_type, milli, demand, supply, changed_at)
           VALUES ($1,$2,$3,$4,$5,now())
           ON CONFLICT (zone_id, vehicle_type) DO UPDATE SET demand = $4, supply = $5,
             manual = false, manual_until = NULL`,
          [r.zone_id, r.vehicle_type, current, demand, supply],
        );
        continue;
      }
      changed++;
      await this.db.tx(async (c) => {
        await this.db.query(
          `INSERT INTO surge_states (zone_id, vehicle_type, milli, demand, supply, manual, manual_until, changed_at)
           VALUES ($1,$2,$3,$4,$5,false,NULL,now())
           ON CONFLICT (zone_id, vehicle_type) DO UPDATE
             SET milli = $3, demand = $4, supply = $5, manual = false, manual_until = NULL, changed_at = now()`,
          [r.zone_id, r.vehicle_type, next, demand, supply],
          c,
        );
        await this.db.query(
          `INSERT INTO surge_history (zone_id, vehicle_type, from_milli, to_milli, demand, supply, source)
           VALUES ($1,$2,$3,$4,$5,$6,'ENGINE')`,
          [r.zone_id, r.vehicle_type, current, next, demand, supply],
          c,
        );
      });
    }
    if (changed) this.logger.log(`surge updated for ${changed} zone/vehicle pairs`);
  }

  async setManual(
    input: { zoneId: string; vehicleType: VehicleType; milli: number; untilMinutes: number | null; reason: string },
    actor: AuthUser,
  ) {
    if (!VEHICLE_TYPES.includes(input.vehicleType)) throw new AppError('VALIDATION_ERROR', 'invalid vehicle type');
    if (input.milli < 1000 || input.milli > 5000) throw new AppError('VALIDATION_ERROR', 'milli must be 1000..5000');
    const until = input.untilMinutes ? new Date(Date.now() + input.untilMinutes * 60_000) : null;
    await this.db.tx(async (c) => {
      const before = await this.db.one(
        'SELECT * FROM surge_states WHERE zone_id = $1 AND vehicle_type = $2 FOR UPDATE',
        [input.zoneId, input.vehicleType],
        c,
      );
      await this.db.query(
        `INSERT INTO surge_states (zone_id, vehicle_type, milli, manual, manual_until, changed_at)
         VALUES ($1,$2,$3,true,$4,now())
         ON CONFLICT (zone_id, vehicle_type) DO UPDATE SET milli = $3, manual = true, manual_until = $4, changed_at = now()`,
        [input.zoneId, input.vehicleType, input.milli, until],
        c,
      );
      await this.db.query(
        `INSERT INTO surge_history (zone_id, vehicle_type, from_milli, to_milli, demand, supply, source, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,'MANUAL',$7)`,
        [input.zoneId, input.vehicleType, before?.milli ?? 1000, input.milli, before?.demand ?? 0, before?.supply ?? 0, actor.id],
        c,
      );
      await this.audit.log(
        { actor, action: 'surge.manual_override', entityType: 'surge_state', entityId: `${input.zoneId}:${input.vehicleType}`, before, after: { ...input, until }, reason: input.reason },
        c,
      );
    });
  }

  async list() {
    return this.db.query(
      `SELECT s.*, z.code AS zone_code, z.name AS zone_name FROM surge_states s
         JOIN service_zones z ON z.id = s.zone_id ORDER BY z.code, s.vehicle_type`,
    );
  }

  async history(limit = 100) {
    return this.db.query('SELECT * FROM surge_history ORDER BY id DESC LIMIT $1', [limit]);
  }
}
