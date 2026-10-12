import { Injectable } from '@nestjs/common';
import { PlatformSettings, settingsSchema } from '@ship/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/auth';
import { DbService } from '../../common/db.service';

export const DEFAULT_SETTINGS: PlatformSettings = {
  minContributionMarginSatang: 100, // ฿1.00 per order floor
  paymentFeeBp: { CASH: 0, QR: 100, CARD: 290 },
  insuranceRiskBp: 100, // 1% of price reserved for claims/risk
  otherVariableCostSatang: 100, // SMS/maps/infra per order
  quoteTtlSeconds: 300,
  offerTtlSeconds: 25,
  dispatchWaves: [
    { radiusM: 3000, maxOffers: 3, incentiveSatang: 0 },
    { radiusM: 6000, maxOffers: 5, incentiveSatang: 0 },
    { radiusM: 10000, maxOffers: 8, incentiveSatang: 1500 },
  ],
  marginGuardMode: 'BLOCK',
  holidays: [],
  dispatchWeights: { pickupEta: 1, deadMileage: 0.5, reliability: 0.6, rating: 0.3, zoneMismatch: 0.2, workload: 0.5, direction: 0.2 },
  scheduledDispatchLeadMin: 30,
  pickupGeofenceM: 300,
  dropoffGeofenceM: 300,
  surge: { enabled: true, minMilli: 1000, maxMilli: 1800, cooldownSeconds: 300 },
};

const KEY = 'platform';
const CACHE_MS = 5_000;

@Injectable()
export class SettingsService {
  private cache: { value: PlatformSettings; at: number } | null = null;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.db.one<{ value: unknown }>('SELECT value FROM platform_settings WHERE key = $1', [KEY]);
    const value = row ? settingsSchema.parse({ ...DEFAULT_SETTINGS, ...(row.value as object) }) : DEFAULT_SETTINGS;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(input: PlatformSettings, actor: AuthUser, reason?: string): Promise<PlatformSettings> {
    const next = settingsSchema.parse(input);
    const before = await this.get();
    await this.db.tx(async (c) => {
      await this.db.query(
        `INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [KEY, JSON.stringify(next), actor.id],
        c,
      );
      await this.audit.log({ actor, action: 'settings.update', entityType: 'platform_settings', entityId: KEY, before, after: next, reason }, c);
    });
    this.cache = null;
    return next;
  }
}
