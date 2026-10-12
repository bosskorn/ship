import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/ship'),
  DATABASE_SSL: bool.default(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0123456789'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(30),
  /** base64 of 32 random bytes; used for AES-256-GCM of PII (national id, bank account...). */
  DATA_ENCRYPTION_KEY: z.string().default('ZGV2LW9ubHktZGF0YS1rZXktY2hhbmdlLW1lLTAwMDE='),
  /** Pepper for HMAC lookups (OTP hash, national id uniqueness). */
  HASH_PEPPER: z.string().min(16).default('dev-only-pepper-change-me'),
  UPLOAD_SIGNING_SECRET: z.string().min(16).default('dev-only-upload-secret'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PAYMENT_MOCK_SECRET: z.string().min(8).default('dev-only-mock-payment'),
  OTP_DEV_ECHO: bool.default(false),
  OTP_DEV_FIXED_CODE: z.string().regex(/^\d{6}$/).optional(),
  ROUTING_PROVIDER: z.enum(['haversine', 'osrm']).default('haversine'),
  OSRM_URL: z.string().url().optional(),
  SMS_PROVIDER: z.enum(['log']).default('log'),
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  METRICS_TOKEN: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Disable BullMQ workers in this process (e.g. API-only pods). */
  RUN_WORKERS: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    const insecure = ['JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'HASH_PEPPER', 'UPLOAD_SIGNING_SECRET'].filter((k) =>
      String(cfg[k as keyof AppConfig]).startsWith('dev-only') || String(cfg[k as keyof AppConfig]).startsWith('ZGV2LW9ubHkt'),
    );
    if (insecure.length) throw new Error(`Refusing to start in production with dev secrets: ${insecure.join(', ')}`);
    if (cfg.OTP_DEV_ECHO || cfg.OTP_DEV_FIXED_CODE) throw new Error('OTP dev flags must be off in production');
  }
  cached = cfg;
  return cfg;
}

export const CONFIG = Symbol('CONFIG');
