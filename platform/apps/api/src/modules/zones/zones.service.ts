import { Injectable } from '@nestjs/common';
import { LatLng, VehicleType, ZoneInput } from '@ship/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService, Queryable } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { bangkokParts } from '../pricing/pricing.engine';

export interface ZoneRow {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  service_hours: { start: string; end: string } | null;
  vehicle_types: VehicleType[];
  active: boolean;
}

@Injectable()
export class ZonesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Smallest active zone containing the point (zones may nest: district inside city). */
  async findByPoint(p: LatLng, client?: Queryable): Promise<ZoneRow | null> {
    return this.db.one<ZoneRow>(
      `SELECT id, code, name, name_en, service_hours, vehicle_types, active
         FROM service_zones
        WHERE active AND ST_Intersects(area, ST_SetSRID(ST_MakePoint($2, $1), 4326))
        ORDER BY ST_Area(area) ASC LIMIT 1`,
      [p.lat, p.lng],
      client,
    );
  }

  isOpen(zone: ZoneRow, at: Date): boolean {
    if (!zone.service_hours) return true;
    const { minutes } = bangkokParts(at);
    const [sh, sm] = zone.service_hours.start.split(':').map(Number);
    const [eh, em] = zone.service_hours.end.split(':').map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  }

  async list() {
    return this.db.query(
      `SELECT id, code, name, name_en, service_hours, vehicle_types, active, ST_AsGeoJSON(area)::json AS geojson,
              created_at, updated_at
         FROM service_zones ORDER BY code`,
    );
  }

  private geojson(input: ZoneInput) {
    for (const ring of input.polygon) {
      const [f, l] = [ring[0], ring[ring.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) throw new AppError('VALIDATION_ERROR', 'Polygon rings must be closed');
    }
    return JSON.stringify({ type: 'Polygon', coordinates: input.polygon });
  }

  async create(input: ZoneInput, actor: AuthUser) {
    return this.db.tx(async (c) => {
      const row = await this.db.one(
        `INSERT INTO service_zones (code, name, name_en, area, service_hours, vehicle_types, active)
         VALUES ($1,$2,$3, ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))), $5, $6, $7)
         RETURNING id, code, name`,
        [input.code, input.name, input.nameEn ?? null, this.geojson(input), input.serviceHours ?? null, input.vehicleTypes, input.active],
        c,
      );
      await this.audit.log({ actor, action: 'zone.create', entityType: 'service_zone', entityId: row.id, after: input }, c);
      return row;
    });
  }

  async update(id: string, input: ZoneInput, actor: AuthUser) {
    return this.db.tx(async (c) => {
      const before = await this.db.one(
        'SELECT code, name, service_hours, vehicle_types, active, ST_AsGeoJSON(area) AS area FROM service_zones WHERE id = $1 FOR UPDATE',
        [id],
        c,
      );
      if (!before) throw NotFound('Zone');
      await this.db.query(
        `UPDATE service_zones SET code=$2, name=$3, name_en=$4,
            area = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))),
            service_hours=$6, vehicle_types=$7, active=$8, updated_at=now()
          WHERE id = $1`,
        [id, input.code, input.name, input.nameEn ?? null, this.geojson(input), input.serviceHours ?? null, input.vehicleTypes, input.active],
        c,
      );
      await this.audit.log({ actor, action: 'zone.update', entityType: 'service_zone', entityId: id, before, after: input }, c);
      return { id };
    });
  }
}
