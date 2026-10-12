import { Inject, Injectable } from '@nestjs/common';
import {
  haversineMeters,
  QuoteOption,
  QuoteRequestInput,
  QuoteResponse,
  satangToNumeric,
  VEHICLE_TH,
  VehicleType,
} from '@ship/shared';
import { DbService } from '../../common/db.service';
import { AppError, NotFound } from '../../common/errors';
import { applyMarginGuard, computePrice, SpecialService } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import { ROUTE_OPTIMIZER, RouteOptimizer, ROUTING_PROVIDER, RoutingProvider } from '../routing/routing.types';
import { SettingsService } from '../settings/settings.service';
import { ZonesService } from '../zones/zones.service';

/** Upper bound for a single on-demand trip (sanity / fraud guard). */
const MAX_TRIP_M = 150_000;

@Injectable()
export class QuotesService {
  constructor(
    private readonly db: DbService,
    private readonly zones: ZonesService,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    @Inject(ROUTE_OPTIMIZER) private readonly optimizer: RouteOptimizer,
  ) {}

  async quote(customerId: string, req: QuoteRequestInput, now = new Date()): Promise<QuoteResponse> {
    const settings = await this.settings.get();
    const zone = await this.zones.findByPoint(req.pickup.location);
    if (!zone) throw new AppError('OUT_OF_SERVICE_AREA', 'ขออภัย จุดรับสินค้าอยู่นอกพื้นที่ให้บริการ', 422);
    const at = req.scheduledAt ? new Date(req.scheduledAt) : now;
    if (req.scheduledAt) {
      const lead = at.getTime() - now.getTime();
      if (lead < 15 * 60_000) throw new AppError('SCHEDULE_TOO_SOON', 'จองล่วงหน้าอย่างน้อย 15 นาที', 422);
      if (lead > 7 * 86_400_000) throw new AppError('SCHEDULE_TOO_FAR', 'จองล่วงหน้าได้ไม่เกิน 7 วัน', 422);
    }
    if (!this.zones.isOpen(zone, at)) throw new AppError('ZONE_CLOSED', 'พื้นที่นี้ยังไม่เปิดให้บริการในเวลานี้', 422);

    // Stop sequence (customer can lock individual stops; the rest are optimised when requested).
    let sequence = req.dropoffs.map((_, i) => i);
    if (req.optimizeRoute && req.dropoffs.length > 1) {
      sequence = await this.optimizer.optimize(
        req.pickup.location,
        req.dropoffs.map((d) => ({ location: d.location, locked: d.locked })),
        req.vehicleType ?? 'CAR',
      );
    }
    const points = [req.pickup.location, ...sequence.map((i) => req.dropoffs[i].location)];
    const straight = points.slice(1).reduce((s, p, i) => s + haversineMeters(points[i], p), 0);
    if (straight > MAX_TRIP_M) throw new AppError('TRIP_TOO_LONG', 'ระยะทางเกินกว่าที่ให้บริการ', 422);

    const vehicles: VehicleType[] = req.vehicleType ? [req.vehicleType] : (zone.vehicle_types as VehicleType[]);
    const etas = await this.nearestDriverEtas(req.pickup.location);
    const options: QuoteOption[] = [];

    for (const vehicle of vehicles) {
      const route = await this.routing.route(points, vehicle);
      const expiresAt = new Date(now.getTime() + settings.quoteTtlSeconds * 1000);
      const base = {
        vehicleType: vehicle,
        distanceM: route.distanceM,
        durationS: route.durationS,
        driverEtaS: etas[vehicle] ?? null,
        expiresAt: expiresAt.toISOString(),
      };

      let unavailable: string | null = null;
      if (!zone.vehicle_types.includes(vehicle)) unavailable = 'VEHICLE_NOT_IN_ZONE';
      const totalWeight = req.parcel.weightKg * (req.parcel.quantity ?? 1);
      if (totalWeight > VEHICLE_TH[vehicle].maxWeightKg) unavailable = 'PARCEL_TOO_HEAVY';
      const rule = await this.pricing.findRule(vehicle, zone.id, at);
      if (!rule) unavailable = 'NO_PRICING';

      if (!rule) {
        options.push({ ...base, quoteId: '', available: false, unavailableReason: unavailable!, price: 0, breakdown: null as any, surgeMilli: 1000 });
        continue;
      }

      const surgeMilli = req.scheduledAt ? 1000 : await this.pricing.surgeMilli(zone.id, vehicle, settings);
      const price = computePrice({
        rule,
        distanceM: route.distanceM,
        durationS: route.durationS,
        dropoffCount: req.dropoffs.length,
        specialServices: (req.specialServices ?? []) as SpecialService[],
        at,
        surgeMilli,
        holidays: settings.holidays,
      });
      const commission = await this.pricing.expectedCommissionBp(vehicle, zone.id, at);
      const promo = await this.pricing.evaluatePromotion(req.promoCode, {
        customerId,
        subtotal: price.breakdown.subtotal,
        vehicle,
        zoneId: zone.id,
        at,
      });
      const guard = applyMarginGuard({
        price,
        promotionDiscount: promo.discount,
        commissionBp: commission.rateBp,
        driverIncentive: 0,
        paymentFeeBp: this.pricing.paymentFeeBp(undefined, settings),
        settings,
        allowBelowMargin: rule.allowBelowMargin,
      });
      if (!guard.available) unavailable = unavailable ?? guard.reason;

      const row = await this.db.one<{ id: string }>(
        `INSERT INTO quotes (customer_id, zone_id, vehicle_type, pricing_rule_id, request, stop_sequence, distance_m, duration_s,
                             breakdown, price, driver_gross, expected_commission_bp, margin, surge_milli, promotion_id,
                             available, unavailable_reason, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [
          customerId,
          zone.id,
          vehicle,
          rule.id,
          JSON.stringify(req),
          sequence,
          route.distanceM,
          route.durationS,
          JSON.stringify(guard.breakdown),
          satangToNumeric(guard.breakdown.total),
          satangToNumeric(price.driverGross),
          commission.rateBp,
          JSON.stringify({ ...guard.margin, guardActions: guard.actions, timeMilli: price.timeMilli, timeLabel: price.timeLabel, promoReason: promo.reason ?? null, routingProvider: route.provider }),
          surgeMilli,
          guard.breakdown.promotionDiscount > 0 ? promo.promotionId : null,
          !unavailable,
          unavailable,
          expiresAt,
        ],
      );
      options.push({
        ...base,
        quoteId: row!.id,
        available: !unavailable,
        unavailableReason: unavailable ?? undefined,
        price: guard.breakdown.total,
        breakdown: guard.breakdown,
        surgeMilli,
      });
    }

    return { zone: { id: zone.id, code: zone.code, name: zone.name }, options };
  }

  async get(customerId: string, quoteId: string) {
    const q = await this.db.one('SELECT * FROM quotes WHERE id = $1 AND customer_id = $2', [quoteId, customerId]);
    if (!q) throw NotFound('Quote');
    return q;
  }

  /** "Driver can be there in N min" per vehicle type, from the nearest online idle driver. */
  private async nearestDriverEtas(p: { lat: number; lng: number }): Promise<Partial<Record<VehicleType, number>>> {
    const rows = await this.db.query<{ type: VehicleType; lat: number; lng: number }>(
      `SELECT DISTINCT ON (v.type) v.type, ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng
         FROM drivers d
         JOIN vehicles v ON v.id = d.current_vehicle_id
         JOIN driver_locations l ON l.driver_id = d.id
        WHERE d.presence = 'ONLINE' AND d.kyc_status = 'APPROVED' AND l.updated_at > now() - interval '3 minutes'
          AND ST_DWithin(l.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 10000)
        ORDER BY v.type, l.location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography`,
      [p.lat, p.lng],
    );
    const out: Partial<Record<VehicleType, number>> = {};
    for (const r of rows) {
      const m = await this.routing.matrix([{ lat: Number(r.lat), lng: Number(r.lng) }], [p], r.type);
      const s = m.durationsS[0][0];
      if (s !== null) out[r.type] = s;
    }
    return out;
  }
}
