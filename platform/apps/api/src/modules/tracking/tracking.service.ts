import { Inject, Injectable } from '@nestjs/common';
import { ACTIVE_DRIVER_STATUSES, haversineMeters, LocationPing, WsEvent } from '@ship/shared';
import { DbService } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { MetricsService } from '../../common/metrics.service';
import { RedisService } from '../../common/redis.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RiskService } from '../risk/risk.service';
import { ROUTING_PROVIDER, RoutingProvider } from '../routing/routing.types';

/** ~200 km/h: faster than any delivery vehicle in Bangkok traffic. */
const IMPOSSIBLE_SPEED_MS = 55;
const MAX_PING_AGE_MS = 10 * 60_000;
const ETA_REFRESH_MS = 30_000;
const OPS_BROADCAST_MS = 5_000;

@Injectable()
export class TrackingService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly risk: RiskService,
    private readonly metrics: MetricsService,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
  ) {}

  async ingest(driverId: string, pings: LocationPing[]): Promise<{ accepted: number }> {
    const now = Date.now();
    const valid = pings
      .filter((p) => p.ts <= now + 60_000 && p.ts >= now - MAX_PING_AGE_MS)
      .sort((a, b) => a.ts - b.ts);
    this.metrics.gpsPings.inc({ result: 'rejected' }, pings.length - valid.length);
    if (!valid.length) return { accepted: 0 };

    const driver = await this.db.one<{ presence: string }>('SELECT presence FROM drivers WHERE id = $1', [driverId]);
    if (!driver || driver.presence === 'OFFLINE') {
      this.metrics.gpsPings.inc({ result: 'offline' }, valid.length);
      return { accepted: 0 };
    }
    const active = await this.db.one<{ id: string; status: string }>(
      `SELECT id, status FROM orders WHERE driver_id = $1 AND status = ANY($2) ORDER BY assigned_at DESC LIMIT 1`,
      [driverId, ACTIVE_DRIVER_STATUSES],
    );

    // ---- fraud signals (recorded, never auto-banned)
    const prevRaw = await this.redis.client.hgetall(`drv:loc:${driverId}`);
    let prev = prevRaw.lat ? { lat: Number(prevRaw.lat), lng: Number(prevRaw.lng), ts: Number(prevRaw.ts) } : null;
    for (const p of valid) {
      if (p.isMocked && (await this.redis.client.set(`risk:mock:${driverId}`, '1', 'EX', 3600, 'NX')) === 'OK') {
        await this.risk.record({ type: 'GPS_MOCKED', userId: driverId, orderId: active?.id, score: 50, details: { lat: p.lat, lng: p.lng } });
      }
      if (prev && p.ts > prev.ts) {
        const speed = haversineMeters(prev, p) / ((p.ts - prev.ts) / 1000);
        if (speed > IMPOSSIBLE_SPEED_MS && haversineMeters(prev, p) > 1000) {
          await this.risk.record({
            type: 'IMPOSSIBLE_TRAVEL',
            userId: driverId,
            orderId: active?.id,
            score: 30,
            details: { from: prev, to: { lat: p.lat, lng: p.lng, ts: p.ts }, speedMs: Math.round(speed) },
          });
        }
      }
      prev = { lat: p.lat, lng: p.lng, ts: p.ts };
    }

    // ---- persistence
    const last = valid[valid.length - 1];
    await this.db.query(
      `INSERT INTO driver_location_history (driver_id, order_id, location, heading, speed, accuracy, is_mocked, recorded_at)
       SELECT $1, $2, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326)::geography, x.heading, x.speed, x.accuracy, coalesce(x.mocked, false),
              to_timestamp(x.ts / 1000.0)
         FROM jsonb_to_recordset($3::jsonb) AS x(lat float8, lng float8, heading real, speed real, accuracy real, mocked boolean, ts bigint)`,
      [driverId, active?.id ?? null, JSON.stringify(valid.map((p) => ({ ...p, mocked: p.isMocked ?? false })))],
    );
    await this.db.query(
      `INSERT INTO driver_locations (driver_id, location, heading, speed, accuracy, recorded_at, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4, $5, $6, to_timestamp($7 / 1000.0), now())
       ON CONFLICT (driver_id) DO UPDATE SET location = EXCLUDED.location, heading = EXCLUDED.heading, speed = EXCLUDED.speed,
         accuracy = EXCLUDED.accuracy, recorded_at = EXCLUDED.recorded_at, updated_at = now()
       WHERE driver_locations.recorded_at <= EXCLUDED.recorded_at`,
      [driverId, last.lat, last.lng, last.heading ?? null, last.speed ?? null, last.accuracy ?? null, last.ts],
    );
    await this.redis.client.hset(`drv:loc:${driverId}`, { lat: last.lat, lng: last.lng, ts: last.ts, heading: last.heading ?? '' });
    await this.redis.client.expire(`drv:loc:${driverId}`, 3600);
    this.metrics.gpsPings.inc({ result: 'accepted' }, valid.length);
    this.metrics.gpsLag.observe(Math.max(0, (now - last.ts) / 1000));

    // ---- fan-out
    let etaSeconds: number | null = null;
    if (active) {
      etaSeconds = await this.etaToNextStop(active.id, { lat: last.lat, lng: last.lng });
      this.realtime.toOrder(active.id, WsEvent.DRIVER_LOCATION, {
        orderId: active.id,
        driverId,
        lat: last.lat,
        lng: last.lng,
        heading: last.heading ?? null,
        ts: last.ts,
        etaSeconds,
      });
    }
    if ((await this.redis.client.set(`ops:loc:${driverId}`, '1', 'PX', OPS_BROADCAST_MS, 'NX')) === 'OK') {
      this.realtime.toOps(WsEvent.OPS_DRIVER_LOCATION, {
        driverId,
        lat: last.lat,
        lng: last.lng,
        heading: last.heading ?? null,
        ts: last.ts,
        presence: driver.presence,
        orderId: active?.id ?? null,
      });
    }
    return { accepted: valid.length };
  }

  /** ETA to the next unfinished stop; recomputed at most every 30 s per order. */
  private async etaToNextStop(orderId: string, at: { lat: number; lng: number }): Promise<number | null> {
    const key = `eta:${orderId}`;
    const cached = await this.redis.client.get(key);
    if (cached) return Number(cached);
    const next = await this.db.one(
      `SELECT ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng, o.vehicle_type
         FROM order_stops s JOIN orders o ON o.id = s.order_id
        WHERE s.order_id = $1 AND s.status <> 'COMPLETED' ORDER BY s.seq LIMIT 1`,
      [orderId],
    );
    if (!next) return null;
    const m = await this.routing.matrix([at], [{ lat: Number(next.lat), lng: Number(next.lng) }], next.vehicle_type);
    const eta = m.durationsS[0][0];
    if (eta !== null) await this.redis.client.set(key, String(eta), 'PX', ETA_REFRESH_MS);
    return eta;
  }

  async orderSnapshot(orderId: string) {
    const o = await this.db.one('SELECT id, status, driver_id FROM orders WHERE id = $1', [orderId]);
    if (!o) throw NotFound('Order');
    if (!o.driver_id) return { orderId, status: o.status, driver: null };
    const l = await this.db.one(
      `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, heading, recorded_at
         FROM driver_locations WHERE driver_id = $1`,
      [o.driver_id],
    );
    const eta = await this.redis.client.get(`eta:${orderId}`);
    return {
      orderId,
      status: o.status,
      driverLocation: l ? { lat: Number(l.lat), lng: Number(l.lng), heading: l.heading, ts: new Date(l.recorded_at).getTime() } : null,
      etaSeconds: eta ? Number(eta) : null,
    };
  }

  /** Driver path for an order (ops replay / dispute handling). */
  async orderPath(orderId: string) {
    return this.db.query(
      `SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, recorded_at, speed, is_mocked
         FROM driver_location_history WHERE order_id = $1 ORDER BY recorded_at LIMIT 5000`,
      [orderId],
    );
  }

  /** Distance driven between two timestamps from GPS history (dead/loaded mileage). */
  async drivenMeters(driverId: string, from: Date, to: Date): Promise<number> {
    const r = await this.db.one<{ m: number | null }>(
      `SELECT ST_Length(ST_MakeLine(location::geometry ORDER BY recorded_at)::geography) AS m
         FROM driver_location_history WHERE driver_id = $1 AND recorded_at BETWEEN $2 AND $3`,
      [driverId, from, to],
    );
    return Math.round(Number(r?.m ?? 0));
  }
}
