import { Injectable } from '@nestjs/common';
import { numericToSatang } from '@ship/shared';
import { DbService } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { OrderViewService } from '../orders/order-view.service';
import { UploadsService } from '../uploads/uploads.service';

/** Late thresholds for the live board. */
const LATE_PICKUP_MIN = 25;
const LATE_DELIVERY_GRACE_MIN = 15;

@Injectable()
export class OpsService {
  constructor(
    private readonly db: DbService,
    private readonly views: OrderViewService,
    private readonly uploads: UploadsService,
  ) {}

  /** Live operations map (spec §25). */
  async live() {
    const drivers = await this.db.query(
      `SELECT d.id, coalesce(d.first_name || ' ' || d.last_name, u.phone) AS name, d.presence, d.tier, d.risk_score,
              v.type AS vehicle_type, v.plate_number,
              ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng, l.heading, l.updated_at,
              (SELECT id FROM orders o WHERE o.driver_id = d.id AND o.status IN
                 ('DRIVER_ASSIGNED','GOING_TO_PICKUP','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DESTINATION') LIMIT 1) AS order_id
         FROM drivers d JOIN users u ON u.id = d.id
         LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
         JOIN driver_locations l ON l.driver_id = d.id
        WHERE d.presence <> 'OFFLINE' OR d.presence_changed_at > now() - interval '30 minutes'`,
    );
    const orders = await this.db.query(
      `SELECT o.id, o.order_no, o.status, o.vehicle_type, o.driver_id, o.created_at, o.assigned_at, o.picked_up_at, o.scheduled_at,
              ST_Y(p.location::geometry) AS pickup_lat, ST_X(p.location::geometry) AS pickup_lng, p.address AS pickup_address,
              ST_Y(d.location::geometry) AS dropoff_lat, ST_X(d.location::geometry) AS dropoff_lng, d.address AS dropoff_address,
              ${this.lateExpr('o')}
         FROM orders o
         JOIN order_stops p ON p.order_id = o.id AND p.type = 'PICKUP'
         JOIN LATERAL (SELECT location, address FROM order_stops WHERE order_id = o.id ORDER BY seq DESC LIMIT 1) d ON true
        WHERE o.status NOT IN ('DELIVERED','CANCELLED','FAILED','RETURNED','QUOTED')
        ORDER BY o.created_at`,
    );
    const counts = await this.db.one(
      `SELECT
         count(*) FILTER (WHERE status = 'SEARCHING_DRIVER') AS waiting,
         count(*) FILTER (WHERE status = 'NO_DRIVER') AS no_driver,
         count(*) FILTER (WHERE status = 'CANCELLED' AND cancelled_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') AS cancelled_today,
         count(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') AS completed_today,
         count(*) FILTER (WHERE status IN ('DRIVER_ASSIGNED','GOING_TO_PICKUP','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DESTINATION')) AS active
       FROM orders WHERE created_at > now() - interval '2 days' OR status NOT IN ('DELIVERED','CANCELLED','FAILED','RETURNED')`,
    );
    const latePickup = orders.filter((o) => o.late_pickup).length;
    const lateDelivery = orders.filter((o) => o.late_delivery).length;
    const openRisk = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM risk_events WHERE status = 'OPEN'`);
    return {
      at: new Date().toISOString(),
      counts: {
        waiting: Number(counts.waiting),
        noDriver: Number(counts.no_driver),
        latePickup,
        lateDelivery,
        cancelledToday: Number(counts.cancelled_today),
        completedToday: Number(counts.completed_today),
        active: Number(counts.active),
        onlineDrivers: drivers.filter((d) => d.presence === 'ONLINE').length,
        busyDrivers: drivers.filter((d) => d.presence === 'BUSY').length,
        openRisk: Number(openRisk!.n),
      },
      drivers: drivers.map((d) => ({ ...d, lat: Number(d.lat), lng: Number(d.lng) })),
      orders: orders.map((o) => ({
        ...o,
        pickup_lat: Number(o.pickup_lat),
        pickup_lng: Number(o.pickup_lng),
        dropoff_lat: Number(o.dropoff_lat),
        dropoff_lng: Number(o.dropoff_lng),
        problem: o.status === 'NO_DRIVER' || o.late_pickup || o.late_delivery,
      })),
    };
  }

  private lateExpr(a: string) {
    return `(${a}.status IN ('DRIVER_ASSIGNED','GOING_TO_PICKUP','ARRIVED_PICKUP') AND ${a}.assigned_at < now() - interval '${LATE_PICKUP_MIN} minutes') AS late_pickup,
            (${a}.status IN ('PICKED_UP','IN_TRANSIT','ARRIVED_DESTINATION')
              AND ${a}.picked_up_at + make_interval(secs => ${a}.duration_s * 1.5) + interval '${LATE_DELIVERY_GRACE_MIN} minutes' < now()) AS late_delivery`;
  }

  async orders(q: { status?: string; search?: string; bucket?: string; limit: number; offset: number }) {
    const where: string[] = ['true'];
    const params: unknown[] = [];
    if (q.status) {
      params.push(q.status.split(','));
      where.push(`o.status = ANY($${params.length})`);
    }
    if (q.search) {
      params.push(`%${q.search}%`);
      where.push(`(o.order_no ILIKE $${params.length} OR cu.phone ILIKE $${params.length} OR du.phone ILIKE $${params.length})`);
    }
    if (q.bucket === 'problem') where.push(`(o.status = 'NO_DRIVER' OR late.late_pickup OR late.late_delivery)`);
    params.push(q.limit, q.offset);
    const rows = await this.db.query(
      `SELECT o.id, o.order_no, o.status, o.vehicle_type, o.service_type, o.price, o.payment_method, o.created_at, o.updated_at,
              o.contribution_margin, o.driver_net, o.driver_id, cu.phone AS customer_phone,
              coalesce(d.first_name || ' ' || d.last_name, du.phone) AS driver_name,
              (SELECT address FROM order_stops WHERE order_id = o.id AND type = 'PICKUP' LIMIT 1) AS pickup,
              (SELECT address FROM order_stops WHERE order_id = o.id ORDER BY seq DESC LIMIT 1) AS dropoff,
              late.late_pickup, late.late_delivery, z.code AS zone_code
         FROM orders o
         JOIN users cu ON cu.id = o.customer_id
         LEFT JOIN drivers d ON d.id = o.driver_id
         LEFT JOIN users du ON du.id = o.driver_id
         LEFT JOIN service_zones z ON z.id = o.zone_id
         CROSS JOIN LATERAL (SELECT ${this.lateExpr('o')}) late
        WHERE ${where.join(' AND ')}
        ORDER BY o.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      price: numericToSatang(r.price),
      contribution_margin: r.contribution_margin === null ? null : numericToSatang(r.contribution_margin),
      driver_net: r.driver_net === null ? null : numericToSatang(r.driver_net),
    }));
  }

  async orderDetail(orderId: string, viewer: any) {
    const view = await this.views.view(orderId, viewer);
    const raw = await this.db.one('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!raw) throw NotFound('Order');
    const [timeline, offers, assignments, pod, payments, quote, customer] = await Promise.all([
      this.views.timeline(orderId),
      this.db.query(
        `SELECT f.id, f.driver_id, f.wave, f.status, f.score, f.score_breakdown, f.distance_to_pickup_m, f.eta_to_pickup_s,
                f.net, f.commission_rate_bp, f.bonus, f.created_at, f.responded_at, f.decline_reason,
                coalesce(d.first_name || ' ' || d.last_name, u.phone) AS driver_name
           FROM dispatch_offers f JOIN drivers d ON d.id = f.driver_id JOIN users u ON u.id = f.driver_id
          WHERE f.order_id = $1 ORDER BY f.created_at`,
        [orderId],
      ),
      this.db.query(
        `SELECT a.*, coalesce(d.first_name || ' ' || d.last_name, u.phone) AS driver_name
           FROM assignments a JOIN drivers d ON d.id = a.driver_id JOIN users u ON u.id = a.driver_id
          WHERE a.order_id = $1 ORDER BY a.assigned_at`,
        [orderId],
      ),
      this.db.query(
        `SELECT id, stop_id, kind, otp_verified, qr_verified, photo_keys, signature_key, recipient_name, distance_from_stop_m,
                override_reason, recorded_at, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
           FROM pod WHERE order_id = $1 ORDER BY recorded_at`,
        [orderId],
      ),
      this.db.query('SELECT id, method, provider, status, amount, fee, created_at, updated_at FROM payments WHERE order_id = $1', [orderId]),
      this.db.one('SELECT id, margin, surge_milli, expected_commission_bp, created_at, expires_at FROM quotes WHERE id = $1', [raw.quote_id]),
      this.db.one('SELECT u.phone, c.name FROM customers c JOIN users u ON u.id = c.id WHERE c.id = $1', [raw.customer_id]),
    ]);
    return {
      ...view,
      customer,
      economics: {
        price: numericToSatang(raw.price),
        driverGross: numericToSatang(raw.driver_gross),
        commissionRateBp: raw.commission_rate_bp,
        commission: raw.commission === null ? null : numericToSatang(raw.commission),
        driverBonus: numericToSatang(raw.driver_bonus),
        driverNet: raw.driver_net === null ? null : numericToSatang(raw.driver_net),
        contributionMargin: raw.contribution_margin === null ? null : numericToSatang(raw.contribution_margin),
        margin: raw.margin,
        quoteMargin: quote?.margin,
        surgeMilli: quote?.surge_milli,
      },
      dispatch: { wave: raw.dispatch_wave, startedAt: raw.dispatch_started_at, assignedAt: raw.assigned_at },
      timeline,
      offers,
      assignments,
      pod: pod.map((p) => ({
        ...p,
        photoUrls: (p.photo_keys as string[]).map((k) => this.uploads.signedReadUrl(k)),
        signatureUrl: p.signature_key ? this.uploads.signedReadUrl(p.signature_key) : null,
      })),
      payments,
    };
  }

  async drivers(q: { kyc?: string; presence?: string; search?: string; limit: number; offset: number }) {
    return this.db.query(
      `SELECT d.id, d.first_name, d.last_name, u.phone, d.kyc_status, d.tier, d.presence, d.presence_changed_at,
              d.rating_sum, d.rating_count, d.offers_received, d.offers_accepted, d.trips_completed, d.trips_cancelled,
              d.risk_score, d.created_at, v.type AS vehicle_type, v.plate_number, v.plate_province, v.status AS vehicle_status,
              l.updated_at AS location_at
         FROM drivers d JOIN users u ON u.id = d.id
         LEFT JOIN vehicles v ON v.id = d.current_vehicle_id
         LEFT JOIN driver_locations l ON l.driver_id = d.id
        WHERE ($1::text IS NULL OR d.kyc_status = $1)
          AND ($2::text IS NULL OR d.presence = $2)
          AND ($3::text IS NULL OR u.phone ILIKE $3 OR d.first_name ILIKE $3 OR d.last_name ILIKE $3 OR v.plate_number ILIKE $3)
        ORDER BY d.created_at DESC LIMIT $4 OFFSET $5`,
      [q.kyc ?? null, q.presence ?? null, q.search ? `%${q.search}%` : null, q.limit, q.offset],
    );
  }

  async driverDetail(driverId: string) {
    const d = await this.db.one(
      `SELECT d.id, d.first_name, d.last_name, d.license_expiry, d.kyc_status, d.kyc_note, d.tier, d.presence, d.risk_score,
              d.rating_sum, d.rating_count, d.offers_received, d.offers_accepted, d.offers_declined, d.offers_expired,
              d.trips_completed, d.trips_cancelled, d.created_at, u.phone, u.status AS account_status
         FROM drivers d JOIN users u ON u.id = d.id WHERE d.id = $1`,
      [driverId],
    );
    if (!d) throw NotFound('Driver');
    const [vehicles, documents, risk, recent] = await Promise.all([
      this.db.query('SELECT * FROM vehicles WHERE driver_id = $1 ORDER BY created_at DESC', [driverId]),
      this.db.query('SELECT id, kind, file_key, status, note, created_at FROM driver_documents WHERE driver_id = $1 ORDER BY created_at DESC', [driverId]),
      this.db.query('SELECT * FROM risk_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [driverId]),
      this.db.query(
        `SELECT id, order_no, status, driver_net, created_at FROM orders WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [driverId],
      ),
    ]);
    return {
      ...d,
      vehicles,
      documents: documents.map((x) => ({ ...x, url: this.uploads.signedReadUrl(x.file_key) })),
      risk,
      recentOrders: recent,
    };
  }

  /** Business KPIs (spec §39) over a window. */
  async kpis(from: Date, to: Date) {
    const r = await this.db.one(
      `WITH o AS (SELECT * FROM orders WHERE created_at >= $1 AND created_at < $2),
       q AS (SELECT count(DISTINCT (customer_id, date_trunc('minute', created_at))) AS sessions FROM quotes WHERE created_at >= $1 AND created_at < $2),
       f AS (SELECT status FROM dispatch_offers WHERE created_at >= $1 AND created_at < $2),
       s AS (SELECT coalesce(sum(extract(epoch FROM (least(coalesce(ended_at, now()), $2) - greatest(started_at, $1)))), 0) AS online_s
               FROM driver_shifts WHERE coalesce(ended_at, now()) > $1 AND started_at < $2),
       busy AS (SELECT coalesce(sum(extract(epoch FROM (coalesce(ended_at, now()) - assigned_at))), 0) AS busy_s
               FROM assignments WHERE assigned_at >= $1 AND assigned_at < $2),
       e AS (SELECT coalesce(sum(net), 0) AS net FROM driver_earnings WHERE earned_at >= $1 AND earned_at < $2)
       SELECT
         (SELECT count(*) FROM o) AS orders,
         (SELECT sessions FROM q) AS quote_sessions,
         (SELECT count(*) FROM o WHERE status = 'DELIVERED') AS delivered,
         (SELECT count(*) FROM o WHERE status = 'CANCELLED') AS cancelled,
         (SELECT count(*) FROM o WHERE status IN ('DELIVERED','CANCELLED','FAILED','RETURNED','NO_DRIVER')) AS finished,
         (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM assigned_at - dispatch_started_at)) FROM o WHERE assigned_at IS NOT NULL AND dispatch_started_at IS NOT NULL) AS ttm_p50,
         (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM assigned_at - dispatch_started_at)) FROM o WHERE assigned_at IS NOT NULL AND dispatch_started_at IS NOT NULL) AS ttm_p90,
         (SELECT avg(extract(epoch FROM picked_up_at - assigned_at)) FROM o WHERE picked_up_at IS NOT NULL) AS pickup_s,
         (SELECT avg(extract(epoch FROM delivered_at - picked_up_at)) FROM o WHERE delivered_at IS NOT NULL) AS delivery_s,
         (SELECT count(*) FROM f WHERE status = 'ACCEPTED') AS offers_accepted,
         (SELECT count(*) FROM f WHERE status IN ('ACCEPTED','DECLINED','EXPIRED')) AS offers_answered,
         (SELECT avg(price) FROM o WHERE status = 'DELIVERED') AS revenue_per_order,
         (SELECT avg(contribution_margin) FROM o WHERE status = 'DELIVERED') AS cm_per_order,
         (SELECT sum(contribution_margin) FROM o WHERE status = 'DELIVERED') AS cm_total,
         (SELECT avg(a.actual_dead_mileage_m) FROM assignments a JOIN o ON o.id = a.order_id WHERE a.actual_dead_mileage_m IS NOT NULL) AS dead_mileage_m,
         (SELECT avg(a.loaded_mileage_m) FROM assignments a JOIN o ON o.id = a.order_id WHERE a.loaded_mileage_m IS NOT NULL) AS loaded_mileage_m,
         (SELECT online_s FROM s) AS online_s,
         (SELECT busy_s FROM busy) AS busy_s,
         (SELECT net FROM e) AS driver_net`,
      [from, to],
    );
    const n = (v: any) => (v === null || v === undefined ? null : Number(v));
    const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
    const onlineH = Number(r.online_s) / 3600;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orders: Number(r.orders),
      quoteToOrderConversion: ratio(Number(r.orders), Number(r.quote_sessions)),
      timeToMatchP50S: n(r.ttm_p50),
      timeToMatchP90S: n(r.ttm_p90),
      avgPickupS: n(r.pickup_s),
      avgDeliveryS: n(r.delivery_s),
      acceptanceRate: ratio(Number(r.offers_accepted), Number(r.offers_answered)),
      cancellationRate: ratio(Number(r.cancelled), Number(r.orders)),
      completionRate: ratio(Number(r.delivered), Number(r.finished)),
      driverUtilization: ratio(Number(r.busy_s), Number(r.online_s)),
      avgDeadMileageM: n(r.dead_mileage_m),
      avgLoadedMileageM: n(r.loaded_mileage_m),
      revenuePerOrder: r.revenue_per_order ? numericToSatang(Number(r.revenue_per_order).toFixed(2)) : null,
      contributionMarginPerOrder: r.cm_per_order ? numericToSatang(Number(r.cm_per_order).toFixed(2)) : null,
      contributionMarginTotal: r.cm_total ? numericToSatang(r.cm_total) : 0,
      driverEarningsPerOnlineHour: onlineH > 0 ? Math.round(numericToSatang(r.driver_net) / onlineH) : null,
      targets: { timeToMatchS: 60, pickupEtaS: 600, acceptanceRate: 0.8, completionRate: 0.97, cancellationRate: 0.03 },
    };
  }
}
