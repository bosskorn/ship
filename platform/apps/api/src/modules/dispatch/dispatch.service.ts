import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { JobOfferPayload, LatLng, numericToSatang, satangToNumeric, VEHICLE_TH, WsEvent } from '@ship/shared';
import type { PoolClient } from 'pg';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { DomainEvent, OpsAlertEvent, OrderStatusChangedEvent } from '../../common/events';
import { MetricsService } from '../../common/metrics.service';
import { QueueService } from '../../common/queue.service';
import { RedisService } from '../../common/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignmentService } from '../orders/assignment.service';
import { OnCommit, OrderStateService, SYSTEM } from '../orders/order-state.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ROUTING_PROVIDER, RoutingProvider } from '../routing/routing.types';
import { SettingsService } from '../settings/settings.service';
import { Candidate, scoreCandidate, ScoreBreakdown } from './dispatch.scoring';

/** How many nearest drivers to pull from PostGIS before routing/scoring. */
const CANDIDATE_POOL = 30;
/** Location older than this means the driver app is not really online. */
const LOCATION_FRESH_S = 120;

export interface ScoredCandidate extends Candidate {
  score: ScoreBreakdown;
  tier: string;
  name: string;
  presence: string;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly state: OrderStateService,
    private readonly assignments: AssignmentService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
  ) {
    this.queue.handle('dispatch', 'wave', (d) => this.runWave(d.orderId, d.wave, d.round));
  }

  // ------------------------------------------------------------------ triggering

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true, promisify: true })
  async onStatus(e: OrderStatusChangedEvent) {
    if (e.to !== 'SEARCHING_DRIVER') return;
    await this.startDispatch(e.orderId);
  }

  /** Start (or restart after a driver cancellation) the wave sequence for an order. */
  async startDispatch(orderId: string) {
    const round = Date.now();
    await this.db.query('UPDATE orders SET dispatch_wave = 0, dispatch_round = $2 WHERE id = $1', [orderId, round]);
    await this.enqueueWave(orderId, round, 0, 0);
  }

  private waveJobId(orderId: string, round: number, wave: number) {
    return `wave:${orderId}:${round}:${wave}`;
  }

  /** Schedule a wave. Replaces a pending timer for the same wave (used to fast-forward on declines). */
  private async enqueueWave(orderId: string, round: number, wave: number, delayMs: number, replace = false) {
    const jobId = this.waveJobId(orderId, round, wave);
    if (replace) {
      const existing = await this.queue.queue('dispatch').getJob(jobId);
      if (existing && (await existing.isDelayed())) await existing.remove().catch(() => undefined);
    }
    await this.queue.add('dispatch', 'wave', { orderId, wave, round }, { jobId, delay: delayMs, attempts: 2 });
  }

  // ------------------------------------------------------------------ waves

  async pickupOf(orderId: string, c?: PoolClient) {
    const s = await this.db.one(
      `SELECT address, district, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM order_stops WHERE order_id = $1 AND type = 'PICKUP' LIMIT 1`,
      [orderId],
      c,
    );
    return { ...s, location: { lat: Number(s.lat), lng: Number(s.lng) } as LatLng };
  }

  async findCandidates(order: any, pickup: LatLng, radiusM: number, opts: { forOps?: boolean; c?: PoolClient } = {}): Promise<ScoredCandidate[]> {
    const settings = await this.settings.get();
    const rows = await this.db.query(
      `SELECT d.id, d.tier, d.first_name, d.last_name, d.presence, d.offers_received, d.offers_accepted,
              d.trips_completed, d.trips_cancelled, d.rating_sum, d.rating_count, d.risk_score,
              ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng, l.heading, l.speed,
              ST_Distance(l.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS dist,
              coalesce((SELECT ST_Intersects(z.area, l.location::geometry) FROM service_zones z WHERE z.id = $5), false) AS in_zone,
              (SELECT count(*) FROM orders ao WHERE ao.driver_id = d.id
                  AND ao.status IN ('DRIVER_ASSIGNED','GOING_TO_PICKUP','ARRIVED_PICKUP','PICKED_UP','IN_TRANSIT','ARRIVED_DESTINATION')) AS active_jobs
         FROM drivers d
         JOIN vehicles v ON v.id = d.current_vehicle_id AND v.status = 'APPROVED' AND v.type = $4
         JOIN driver_locations l ON l.driver_id = d.id
        WHERE d.kyc_status = 'APPROVED'
          AND ST_DWithin(l.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
          AND ${
            opts.forOps
              ? `d.presence IN ('ONLINE','BUSY') AND l.updated_at > now() - interval '15 minutes'`
              : `d.presence = 'ONLINE' AND l.updated_at > now() - make_interval(secs => ${LOCATION_FRESH_S})
                 AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.driver_id = d.id AND o.status = 'PENDING' AND o.expires_at > now())
                 AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.driver_id = d.id AND o.order_id = $6)`
          }
        ORDER BY l.location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        LIMIT ${CANDIDATE_POOL}`,
      opts.forOps
        ? [pickup.lat, pickup.lng, radiusM, order.vehicle_type, order.zone_id]
        : [pickup.lat, pickup.lng, radiusM, order.vehicle_type, order.zone_id, order.id],
      opts.c,
    );
    if (!rows.length) return [];

    const locations = rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }));
    const matrix = await this.routing.matrix(locations, [pickup], order.vehicle_type);
    const out: ScoredCandidate[] = rows.map((r, i) => {
      const c: Candidate = {
        driverId: r.id,
        location: locations[i],
        heading: r.heading,
        speedMs: r.speed,
        distanceToPickupM: matrix.distancesM[i][0] ?? Math.round(Number(r.dist)),
        etaToPickupS: matrix.durationsS[i][0] ?? Math.round(Number(r.dist) / 6),
        offersReceived: r.offers_received,
        offersAccepted: r.offers_accepted,
        tripsCompleted: r.trips_completed,
        tripsCancelled: r.trips_cancelled,
        ratingSum: r.rating_sum,
        ratingCount: r.rating_count,
        inOrderZone: r.in_zone,
        activeJobs: Number(r.active_jobs),
        riskScore: r.risk_score,
      };
      return {
        ...c,
        score: scoreCandidate(c, pickup, settings.dispatchWeights),
        tier: r.tier,
        name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        presence: r.presence,
      };
    });
    return out.sort((a, b) => a.score.total - b.score.total);
  }

  async runWave(orderId: string, wave: number, round: number) {
    const started = process.hrtime.bigint();
    const settings = await this.settings.get();
    const lockRelease = await this.redis.lock(`lock:dispatch:${orderId}`, 10_000);
    if (!lockRelease) throw new Error(`dispatch lock busy for ${orderId}`); // BullMQ retries with backoff
    // each (round, wave) runs at most once even if enqueued twice
    const doneKey = `dispatch:done:${orderId}:${round}:${wave}`;
    if ((await this.redis.client.set(doneKey, '1', 'EX', 3600, 'NX')) !== 'OK') {
      await lockRelease();
      return;
    }
    try {
      const outcome = await this.db.tx(async (c, onCommit) => {
        const order = await this.state.lock(c, orderId);
        if (order.status !== 'SEARCHING_DRIVER') return { done: true };
        if (Number(order.dispatch_round) !== round || wave < order.dispatch_wave) return { done: true }; // stale job

        await this.expirePendingOffers(c, onCommit, orderId);

        if (wave >= settings.dispatchWaves.length) {
          await this.state.transition(c, onCommit, order, 'NO_DRIVER', SYSTEM, { data: { waves: wave } });
          const alert: OpsAlertEvent = { kind: 'NO_DRIVER', orderId, message: `ไม่พบคนขับ ${order.order_no}`, at: new Date().toISOString() };
          onCommit(() => void this.events.emit(DomainEvent.OPS_ALERT, alert));
          return { done: true };
        }

        const cfg = settings.dispatchWaves[wave];
        const pickup = await this.pickupOf(orderId, c);
        const candidates = (await this.findCandidates(order, pickup.location, cfg.radiusM, { c })).slice(0, cfg.maxOffers);
        await this.db.query('UPDATE orders SET dispatch_wave = $2 WHERE id = $1', [orderId, wave], c);

        if (!candidates.length) {
          await this.state.appendEvent(c, orderId, 'DISPATCH_WAVE_EMPTY', SYSTEM, { wave, radiusM: cfg.radiusM });
          return { nextDelayMs: 2000 };
        }

        const expiresAt = new Date(Date.now() + settings.offerTtlSeconds * 1000);
        const payloads: { driverId: string; payload: JobOfferPayload }[] = [];
        const dropoffs = await this.db.query(
          `SELECT address, district, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
             FROM order_stops WHERE order_id = $1 AND type = 'DROPOFF' ORDER BY seq`,
          [orderId],
          c,
        );
        for (const cand of candidates) {
          const terms = await this.assignments.termsFor(order, { id: cand.driverId, tier: cand.tier }, cfg.incentiveSatang);
          const offer = await this.db.one<{ id: string }>(
            `INSERT INTO dispatch_offers (order_id, driver_id, wave, score, score_breakdown, distance_to_pickup_m, eta_to_pickup_s,
                                          gross, commission_rate_bp, commission, bonus, net, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [
              orderId,
              cand.driverId,
              wave,
              cand.score.total,
              JSON.stringify(cand.score),
              cand.distanceToPickupM,
              cand.etaToPickupS,
              satangToNumeric(terms.gross),
              terms.commissionRateBp,
              satangToNumeric(terms.commission),
              satangToNumeric(terms.bonus),
              satangToNumeric(terms.net),
              expiresAt,
            ],
            c,
          );
          await this.db.query('UPDATE drivers SET offers_received = offers_received + 1 WHERE id = $1', [cand.driverId], c);
          payloads.push({
            driverId: cand.driverId,
            payload: {
              offerId: offer!.id,
              orderId,
              orderNo: order.order_no,
              expiresAt: expiresAt.toISOString(),
              vehicleType: order.vehicle_type,
              pickup: { address: pickup.address, district: pickup.district, location: pickup.location },
              dropoffs: dropoffs.map((d) => ({ address: d.address, district: d.district, location: { lat: Number(d.lat), lng: Number(d.lng) } })),
              stopCount: dropoffs.length,
              distanceToPickupM: cand.distanceToPickupM,
              deliveryDistanceM: order.distance_m,
              estimatedDurationS: cand.etaToPickupS + order.duration_s,
              grossFare: terms.gross,
              commission: terms.commission,
              commissionRateBp: terms.commissionRateBp,
              bonus: terms.bonus,
              netEarnings: terms.net,
              cashToCollect: order.payment_method === 'CASH' ? numericToSatang(order.price) : 0,
              parcelSummary: `${order.parcel?.category ?? ''} ${order.parcel?.weightKg ?? ''} กก.`.trim(),
            },
          });
        }
        await this.state.appendEvent(c, orderId, 'DISPATCH_WAVE', SYSTEM, {
          wave,
          radiusM: cfg.radiusM,
          incentive: cfg.incentiveSatang,
          offers: candidates.map((x) => ({ driverId: x.driverId, score: x.score.total, etaS: x.etaToPickupS, distM: x.distanceToPickupM })),
        });
        onCommit(async () => {
          for (const p of payloads) {
            this.realtime.toUser(p.driverId, WsEvent.OFFER_NEW, p.payload);
            this.metrics.offers.inc({ outcome: 'sent' });
            await this.notifications.notify({
              userId: p.driverId,
              event: 'JOB_OFFER',
              title: `งานใหม่ ${(p.payload.netEarnings / 100).toFixed(0)} บาท`,
              body: `${p.payload.pickup.address} → ${p.payload.dropoffs[p.payload.dropoffs.length - 1]?.address ?? ''}`,
              data: { offerId: p.payload.offerId, orderId },
              pushChannel: 'job-offer',
            });
          }
        });
        return { nextDelayMs: settings.offerTtlSeconds * 1000 + 1000 };
      });

      if ('nextDelayMs' in outcome && outcome.nextDelayMs !== undefined) {
        await this.enqueueWave(orderId, round, wave + 1, outcome.nextDelayMs);
      }
    } catch (e) {
      await this.redis.client.del(doneKey); // allow the retry to run
      throw e;
    } finally {
      await lockRelease();
      this.metrics.dispatchWaveLatency.observe(Number(process.hrtime.bigint() - started) / 1e9);
    }
  }

  private async expirePendingOffers(c: PoolClient, onCommit: OnCommit, orderId: string) {
    const expired = await this.db.query<{ id: string; driver_id: string }>(
      `UPDATE dispatch_offers SET status = 'EXPIRED', responded_at = now()
        WHERE order_id = $1 AND status = 'PENDING' RETURNING id, driver_id`,
      [orderId],
      c,
    );
    for (const e of expired) {
      await this.db.query('UPDATE drivers SET offers_expired = offers_expired + 1 WHERE id = $1', [e.driver_id], c);
    }
    onCommit(() => {
      for (const e of expired) {
        this.metrics.offers.inc({ outcome: 'expired' });
        this.realtime.toUser(e.driver_id, WsEvent.OFFER_REVOKED, { offerId: e.id, orderId, reason: 'EXPIRED' });
      }
    });
  }

  // ------------------------------------------------------------------ driver responses

  async currentOffers(driverId: string) {
    const offers = await this.db.query(
      `SELECT o.id FROM dispatch_offers o WHERE o.driver_id = $1 AND o.status = 'PENDING' AND o.expires_at > now()
        ORDER BY o.created_at DESC`,
      [driverId],
    );
    return Promise.all(offers.map((o) => this.offerPayload(o.id)));
  }

  async offerPayload(offerId: string): Promise<JobOfferPayload> {
    const o = await this.db.one(
      `SELECT f.*, ord.order_no, ord.vehicle_type, ord.distance_m, ord.duration_s, ord.payment_method, ord.price, ord.parcel
         FROM dispatch_offers f JOIN orders ord ON ord.id = f.order_id WHERE f.id = $1`,
      [offerId],
    );
    if (!o) throw NotFound('Offer');
    const pickup = await this.pickupOf(o.order_id);
    const dropoffs = await this.db.query(
      `SELECT address, district, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM order_stops WHERE order_id = $1 AND type = 'DROPOFF' ORDER BY seq`,
      [o.order_id],
    );
    return {
      offerId: o.id,
      orderId: o.order_id,
      orderNo: o.order_no,
      expiresAt: o.expires_at.toISOString(),
      vehicleType: o.vehicle_type,
      pickup: { address: pickup.address, district: pickup.district, location: pickup.location },
      dropoffs: dropoffs.map((d) => ({ address: d.address, district: d.district, location: { lat: Number(d.lat), lng: Number(d.lng) } })),
      stopCount: dropoffs.length,
      distanceToPickupM: o.distance_to_pickup_m,
      deliveryDistanceM: o.distance_m,
      estimatedDurationS: o.eta_to_pickup_s + o.duration_s,
      grossFare: numericToSatang(o.gross),
      commission: numericToSatang(o.commission),
      commissionRateBp: o.commission_rate_bp,
      bonus: numericToSatang(o.bonus),
      netEarnings: numericToSatang(o.net),
      cashToCollect: o.payment_method === 'CASH' ? numericToSatang(o.price) : 0,
      parcelSummary: `${o.parcel?.category ?? ''} ${o.parcel?.weightKg ?? ''} กก.`.trim(),
    };
  }

  async accept(driver: AuthUser, offerId: string) {
    const offer = await this.db.one('SELECT order_id FROM dispatch_offers WHERE id = $1 AND driver_id = $2', [offerId, driver.id]);
    if (!offer) throw NotFound('Offer');
    // Fast-path lock so concurrent accepts don't pile up on the order row.
    const release = await this.redis.lock(`lock:accept:${offer.order_id}`, 5000);
    if (!release) throw new AppError('OFFER_TAKEN', 'งานนี้มีคนรับแล้ว', 409);
    try {
      return await this.db.tx(async (c, onCommit) => {
        const o = await this.db.one('SELECT * FROM dispatch_offers WHERE id = $1 FOR UPDATE', [offerId], c);
        if (o.status !== 'PENDING') throw new AppError(o.status === 'CANCELLED' ? 'OFFER_TAKEN' : 'OFFER_EXPIRED', 'งานนี้ไม่พร้อมรับแล้ว', 409);
        if (new Date(o.expires_at) <= new Date()) throw new AppError('OFFER_EXPIRED', 'หมดเวลารับงาน', 409);
        const order = await this.state.lock(c, o.order_id);
        if (order.status !== 'SEARCHING_DRIVER') throw new AppError('OFFER_TAKEN', 'งานนี้มีคนรับแล้ว', 409);

        await this.db.query(`UPDATE dispatch_offers SET status = 'ACCEPTED', responded_at = now() WHERE id = $1`, [offerId], c);
        await this.db.query('UPDATE drivers SET offers_accepted = offers_accepted + 1 WHERE id = $1', [driver.id], c);
        const updated = await this.assignments.assign(c, onCommit, order, {
          driverId: driver.id,
          method: 'AUTO',
          actor: { type: 'DRIVER', id: driver.id },
          offerId,
          terms: {
            gross: numericToSatang(o.gross),
            commissionRateBp: o.commission_rate_bp,
            commission: numericToSatang(o.commission),
            bonus: numericToSatang(o.bonus),
            net: numericToSatang(o.net),
          },
        });
        onCommit(() => {
          this.metrics.offers.inc({ outcome: 'accepted' });
          if (order.dispatch_started_at) this.metrics.timeToMatch.observe((Date.now() - new Date(order.dispatch_started_at).getTime()) / 1000);
        });
        return { orderId: order.id, status: updated.status };
      });
    } finally {
      await release();
    }
  }

  async decline(driver: AuthUser, offerId: string, reason?: string) {
    const result = await this.db.tx(async (c) => {
      const o = await this.db.one('SELECT * FROM dispatch_offers WHERE id = $1 AND driver_id = $2 FOR UPDATE', [offerId, driver.id], c);
      if (!o) throw NotFound('Offer');
      if (o.status !== 'PENDING') return { orderId: o.order_id, remaining: -1 };
      await this.db.query(
        `UPDATE dispatch_offers SET status = 'DECLINED', responded_at = now(), decline_reason = $2 WHERE id = $1`,
        [offerId, reason ?? null],
        c,
      );
      await this.db.query('UPDATE drivers SET offers_declined = offers_declined + 1 WHERE id = $1', [driver.id], c);
      const pending = await this.db.one<{ n: string }>(
        `SELECT count(*) AS n FROM dispatch_offers WHERE order_id = $1 AND status = 'PENDING'`,
        [o.order_id],
        c,
      );
      return { orderId: o.order_id, wave: o.wave, remaining: Number(pending!.n) };
    });
    this.metrics.offers.inc({ outcome: 'declined' });
    if (result.remaining === 0) {
      // Everyone in this wave said no: don't wait for the timer.
      const order = await this.db.one('SELECT dispatch_wave, dispatch_round, status FROM orders WHERE id = $1', [result.orderId]);
      if (order?.status === 'SEARCHING_DRIVER') {
        await this.enqueueWave(result.orderId, Number(order.dispatch_round), order.dispatch_wave + 1, 0, true);
      }
    }
    return { ok: true };
  }

  // ------------------------------------------------------------------ ops

  async candidatesForOps(orderId: string) {
    const order = await this.db.one('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order) throw NotFound('Order');
    const pickup = await this.pickupOf(orderId);
    const list = await this.findCandidates(order, pickup.location, 20_000, { forOps: true });
    return list.map((c) => ({
      driverId: c.driverId,
      name: c.name,
      tier: c.tier,
      presence: c.presence,
      distanceToPickupM: c.distanceToPickupM,
      etaToPickupS: c.etaToPickupS,
      score: c.score,
      activeJobs: c.activeJobs,
      riskScore: c.riskScore,
      location: c.location,
      vehicle: VEHICLE_TH[order.vehicle_type as keyof typeof VEHICLE_TH].name,
    }));
  }

  async manualAssign(actor: AuthUser, orderId: string, driverId: string, reason: string, ip: string) {
    return this.db.tx(async (c, onCommit) => {
      const order = await this.state.lock(c, orderId);
      if (!['SEARCHING_DRIVER', 'NO_DRIVER', 'SCHEDULED'].includes(order.status))
        throw new AppError('CANNOT_ASSIGN', `Order is ${order.status}`, 409);
      await this.db.query(
        `UPDATE dispatch_offers SET status = 'CANCELLED', responded_at = now() WHERE order_id = $1 AND status = 'PENDING' RETURNING driver_id`,
        [orderId],
        c,
      );
      const updated = await this.assignments.assign(c, onCommit, order, {
        driverId,
        method: 'MANUAL',
        actor: { type: 'OPS', id: actor.id },
        reason,
      });
      await this.audit.log(
        { actor, action: 'dispatch.manual_assign', entityType: 'order', entityId: orderId, before: { status: order.status, driverId: order.driver_id }, after: { driverId, status: updated.status }, reason, ip },
        c,
      );
      return { orderId, status: updated.status };
    });
  }

  async redispatch(actor: AuthUser, orderId: string, reason: string) {
    return this.db.tx(async (c, onCommit) => {
      const order = await this.state.lock(c, orderId);
      const updated = await this.state.transition(c, onCommit, order, 'SEARCHING_DRIVER', { type: 'OPS', id: actor.id }, { data: { reason } });
      await this.audit.log({ actor, action: 'dispatch.redispatch', entityType: 'order', entityId: orderId, before: { status: order.status }, after: { status: updated.status }, reason }, c);
      return { orderId, status: updated.status };
    });
  }

  /** Safety net: orders stuck in SEARCHING_DRIVER with no live offers and no queued wave. */
  async sweepStuck() {
    const stuck = await this.db.query<{ id: string }>(
      `SELECT o.id FROM orders o
        WHERE o.status = 'SEARCHING_DRIVER' AND o.updated_at < now() - interval '90 seconds'
          AND NOT EXISTS (SELECT 1 FROM dispatch_offers f WHERE f.order_id = o.id AND f.created_at > now() - interval '90 seconds')`,
    );
    if (!stuck.length) return;
    const queued = await this.queue.queue('dispatch').getJobs(['delayed', 'waiting', 'active']);
    for (const s of stuck) {
      if (queued.some((j) => j.data?.orderId === s.id)) continue;
      this.logger.warn(`restarting stuck dispatch for ${s.id}`);
      await this.startDispatch(s.id);
    }
  }
}
