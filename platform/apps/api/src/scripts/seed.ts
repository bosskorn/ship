/* Idempotent seed: Bangkok pilot zones, pricing, GP tiers, settings, staff accounts. */
import { Client } from 'pg';
import { satangToNumeric } from '@ship/shared';
import { loadConfig } from '../config';
import { hashPassword } from '../common/crypto';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.service';

const rect = (minLat: number, minLng: number, maxLat: number, maxLng: number) => ({
  type: 'Polygon',
  coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
});

/** Approximate pilot polygons. Replace with surveyed boundaries in the ops Zones screen. */
const ZONES = [
  { code: 'BKK-PILOT', name: 'กรุงเทพฯ (พื้นที่นำร่อง)', nameEn: 'Bangkok pilot', area: rect(13.64, 100.45, 13.95, 100.80) },
  { code: 'LATPHRAO', name: 'ลาดพร้าว', nameEn: 'Lat Phrao', area: rect(13.79, 100.56, 13.84, 100.62) },
  { code: 'CHATUCHAK', name: 'จตุจักร', nameEn: 'Chatuchak', area: rect(13.79, 100.52, 13.86, 100.56) },
  { code: 'BANGKHEN', name: 'บางเขน', nameEn: 'Bang Khen', area: rect(13.84, 100.56, 13.90, 100.66) },
  { code: 'RAMINTRA', name: 'รามอินทรา', nameEn: 'Ramintra', area: rect(13.84, 100.66, 13.89, 100.74) },
];

const PEAK = [
  { label: 'เร่งด่วนเช้า', days: [1, 2, 3, 4, 5], start: '07:00', end: '09:30', milli: 1100 },
  { label: 'เร่งด่วนเย็น', days: [1, 2, 3, 4, 5], start: '17:00', end: '19:30', milli: 1150 },
  { label: 'กลางคืน', days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '05:00', milli: 1100 },
];

const baht = (b: number) => satangToNumeric(Math.round(b * 100));

const PRICING = [
  { vehicle: 'MOTORCYCLE', base: 30, perKm: 6.5, min: 45, stop: 15, wait: 2, fees: { INSURANCE: 1000 } },
  { vehicle: 'CAR', base: 60, perKm: 9, min: 90, stop: 25, wait: 3, fees: { INSURANCE: 1500 } },
  { vehicle: 'PICKUP', base: 150, perKm: 14, min: 250, stop: 40, wait: 4, fees: { INSURANCE: 3000, HELPER: 20000, RETURN_TRIP: 0 } },
  { vehicle: 'VAN', base: 200, perKm: 16, min: 300, stop: 50, wait: 4, fees: { INSURANCE: 3000, HELPER: 20000, RETURN_TRIP: 0 } },
];

const TIERS: [string, number][] = [
  ['NEW', 0],
  ['STANDARD', 800],
  ['SILVER', 700],
  ['GOLD', 600],
  ['PRO', 500],
];

async function main() {
  const cfg = loadConfig();
  if (cfg.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('Set SEED_ADMIN_PASSWORD to seed staff accounts in production');
  }
  const c = new Client({ connectionString: cfg.DATABASE_URL, ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: true } : undefined });
  await c.connect();
  try {
    await c.query('BEGIN');
    for (const z of ZONES) {
      await c.query(
        `INSERT INTO service_zones (code, name, name_en, area) VALUES ($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
         ON CONFLICT (code) DO NOTHING`,
        [z.code, z.name, z.nameEn, JSON.stringify(z.area)],
      );
    }
    const hasPricing = await c.query('SELECT 1 FROM pricing_rules LIMIT 1');
    if (!hasPricing.rowCount) {
      for (const p of PRICING) {
        await c.query(
          `INSERT INTO pricing_rules (name, vehicle_type, base_fare, per_km, minimum_fare, additional_stop_fee, waiting_fee_per_min,
                                      free_waiting_min, special_service_fees, time_multipliers)
           VALUES ($1,$2,$3,$4,$5,$6,$7,15,$8,$9)`,
          [`${p.vehicle} มาตรฐาน กรุงเทพฯ`, p.vehicle, baht(p.base), baht(p.perKm), baht(p.min), baht(p.stop), baht(p.wait), JSON.stringify(p.fees), JSON.stringify(PEAK)],
        );
      }
    }
    const hasGp = await c.query('SELECT 1 FROM commission_rules LIMIT 1');
    if (!hasGp.rowCount) {
      for (const [tier, bp] of TIERS) {
        await c.query(`INSERT INTO commission_rules (name, tier, rate_bp) VALUES ($1,$2,$3)`, [`GP ${tier}`, tier, bp]);
      }
    }
    await c.query(`INSERT INTO platform_settings (key, value) VALUES ('platform', $1) ON CONFLICT (key) DO NOTHING`, [
      JSON.stringify(DEFAULT_SETTINGS),
    ]);
    await c.query(
      `INSERT INTO promotions (code, description, discount_type, discount_value, max_discount, budget, per_user_limit)
       VALUES ('WELCOME20', 'ส่วนลดผู้ใช้ใหม่ ฿20', 'FIXED', 20, 20, 50000, 1) ON CONFLICT (code) DO NOTHING`,
    );

    const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
    for (const [email, role] of [
      ['admin@ship.local', 'ADMIN'],
      ['ops@ship.local', 'OPS'],
    ]) {
      await c.query(
        `INSERT INTO users (role, email, password_hash, display_name) VALUES ($1,$2,$3,$4)
         ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING`,
        [role, email, hashPassword(password), role === 'ADMIN' ? 'Admin' : 'Operations'],
      );
    }
    await c.query('COMMIT');
    console.log('seed complete');
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`staff logins: admin@ship.local / ops@ship.local  password: ${password}  (development only)`);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
