import { z } from 'zod';
const vehicle = z.enum(['MOTORCYCLE', 'CAR', 'PICKUP', 'VAN']);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+66|0)\d{8,9}$/, 'เบอร์โทรไม่ถูกต้อง');

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ---------- Auth ----------
export const requestOtpSchema = z.object({
  phone: phoneSchema,
  role: z.enum(['CUSTOMER', 'DRIVER']),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  role: z.enum(['CUSTOMER', 'DRIVER']),
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(4).max(128),
  deviceName: z.string().max(128).optional(),
  pushToken: z.string().max(512).optional(),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totp: z.string().regex(/^\d{6}$/).optional(),
  deviceId: z.string().min(4).max(128),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  deviceId: z.string().min(4).max(128),
});

// ---------- Address / stops ----------
export const stopInputSchema = z.object({
  location: latLngSchema,
  address: z.string().trim().min(1).max(500),
  building: z.string().max(120).optional(),
  floor: z.string().max(20).optional(),
  room: z.string().max(40).optional(),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: phoneSchema,
  note: z.string().max(500).optional(),
  /** Customer-locked sequence position (multi-stop). */
  locked: z.boolean().optional(),
});
export type StopInput = z.infer<typeof stopInputSchema>;

export const parcelSchema = z.object({
  category: z.enum(['DOCUMENT', 'FOOD', 'SMALL_BOX', 'LARGE_ITEM', 'FURNITURE', 'ELECTRONICS', 'OTHER']),
  weightKg: z.number().positive().max(2000),
  lengthCm: z.number().positive().max(600).optional(),
  widthCm: z.number().positive().max(300).optional(),
  heightCm: z.number().positive().max(300).optional(),
  quantity: z.number().int().min(1).max(500).default(1),
  fragile: z.boolean().default(false),
  temperatureSensitive: z.boolean().default(false),
  highValue: z.boolean().default(false),
  declaredValue: z.number().nonnegative().max(1_000_000).optional(),
  note: z.string().max(500).optional(),
  photoKeys: z.array(z.string().max(300)).max(5).optional(),
});
export type ParcelInput = z.infer<typeof parcelSchema>;

export const MAX_DROPOFF_STOPS = 20;

export const quoteRequestSchema = z.object({
  pickup: stopInputSchema,
  dropoffs: z.array(stopInputSchema).min(1).max(MAX_DROPOFF_STOPS),
  parcel: parcelSchema,
  /** If omitted, the server returns a quote per available vehicle type. */
  vehicleType: vehicle.optional(),
  scheduledAt: z.string().datetime().optional(),
  specialServices: z.array(z.enum(['HELPER', 'RETURN_TRIP', 'INSURANCE'])).max(5).optional(),
  promoCode: z.string().max(40).optional(),
  optimizeRoute: z.boolean().optional(),
});
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

export const createOrderSchema = z.object({
  quoteId: z.string().uuid(),
  paymentMethod: z.enum(['CASH', 'QR', 'CARD']),
  /** Which stop collects cash when paymentMethod = CASH. */
  cashCollectAt: z.enum(['PICKUP', 'DROPOFF']).default('PICKUP'),
  idempotencyKey: z.string().min(8).max(80),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

export const rateOrderSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  tipSatang: z.number().int().min(0).max(100_000).optional(),
});

// ---------- Driver ----------
export const driverProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  nationalId: z.string().regex(/^\d{13}$/, 'เลขบัตรประชาชน 13 หลัก'),
  licenseNumber: z.string().trim().min(4).max(30),
  licenseExpiry: z.string().date(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  bankName: z.string().max(60).optional(),
  bankAccountNumber: z.string().regex(/^\d{10,15}$/).optional(),
  bankAccountName: z.string().max(120).optional(),
});
export type DriverProfileInput = z.infer<typeof driverProfileSchema>;

export const vehicleSchema = z.object({
  type: vehicle,
  plateNumber: z.string().trim().min(2).max(20),
  plateProvince: z.string().trim().min(2).max(60),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  color: z.string().max(30).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const driverDocumentSchema = z.object({
  kind: z.enum(['SELFIE', 'NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTO', 'BANK_BOOK']),
  fileKey: z.string().min(1).max(300),
});

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(10_000).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(100).optional(),
  /** Device timestamp in ms since epoch. */
  ts: z.number().int().positive(),
  isMocked: z.boolean().optional(),
});
export type LocationPing = z.infer<typeof locationPingSchema>;

export const locationBatchSchema = z.object({
  pings: z.array(locationPingSchema).min(1).max(200),
});

export const presenceSchema = z.object({
  online: z.boolean(),
  location: latLngSchema.optional(),
});

/** Evidence a driver attaches to a stop transition. */
export const stopEvidenceSchema = z.object({
  location: latLngSchema,
  otp: z.string().regex(/^\d{4,6}$/).optional(),
  qrPayload: z.string().max(500).optional(),
  photoKeys: z.array(z.string().max(300)).max(5).optional(),
  signatureKey: z.string().max(300).optional(),
  recipientName: z.string().max(120).optional(),
  /** Required when the driver is outside the geofence. */
  overrideReason: z.string().max(300).optional(),
});
export type StopEvidence = z.infer<typeof stopEvidenceSchema>;

export const arriveSchema = z.object({
  location: latLngSchema,
  overrideReason: z.string().max(300).optional(),
});

// ---------- Ops / admin ----------
export const manualAssignSchema = z.object({
  driverId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

export const pricingRuleSchema = z.object({
  vehicleType: vehicle,
  zoneId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  baseFare: z.number().int().min(0),
  perKm: z.number().int().min(0),
  includedKm: z.number().min(0).max(100).default(0),
  minimumFare: z.number().int().min(0),
  vehicleFee: z.number().int().min(0).default(0),
  additionalStopFee: z.number().int().min(0),
  waitingFeePerMin: z.number().int().min(0),
  freeWaitingMin: z.number().int().min(0).max(120),
  trafficFeePerMin: z.number().int().min(0).default(0),
  /** Fee per special service code, satang. INSURANCE is platform revenue; others go to the driver. */
  specialServiceFees: z.record(z.enum(['HELPER', 'RETURN_TRIP', 'INSURANCE']), z.number().int().min(0)).default({}),
  /** Allow quotes below the minimum contribution margin (explicit admin override, audited). */
  allowBelowMargin: z.boolean().default(false),
  /** Time-of-day / day-of-week multiplier windows, multiplier in thousandths. */
  timeMultipliers: z
    .array(
      z.object({
        label: z.string().max(40),
        days: z.array(z.number().int().min(0).max(6)).min(1),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        milli: z.number().int().min(500).max(5000),
      }),
    )
    .default([]),
  active: z.boolean().default(true),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});
export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;

export const commissionRuleSchema = z.object({
  name: z.string().min(1).max(120),
  driverId: z.string().uuid().nullable().optional(),
  tier: z.enum(['NEW', 'STANDARD', 'SILVER', 'GOLD', 'PRO']).nullable().optional(),
  vehicleType: vehicle.nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  campaign: z.string().max(60).nullable().optional(),
  /** Commission in basis points: 800 = 8%. */
  rateBp: z.number().int().min(0).max(5000),
  priority: z.number().int().min(0).max(1000).default(0),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;

export const zoneSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{2,32}$/),
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional(),
  /** GeoJSON Polygon coordinates: [[[lng, lat], ...]] */
  polygon: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
  serviceHours: z
    .object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
    .nullable()
    .optional(),
  vehicleTypes: z.array(vehicle).min(1),
  active: z.boolean().default(true),
});
export type ZoneInput = z.infer<typeof zoneSchema>;

export const settingsSchema = z.object({
  minContributionMarginSatang: z.number().int(),
  paymentFeeBp: z.object({ CASH: z.number().int(), QR: z.number().int(), CARD: z.number().int() }),
  insuranceRiskBp: z.number().int().min(0).max(2000),
  otherVariableCostSatang: z.number().int().min(0),
  quoteTtlSeconds: z.number().int().min(60).max(1800),
  offerTtlSeconds: z.number().int().min(10).max(120),
  dispatchWaves: z
    .array(z.object({ radiusM: z.number().int().min(500).max(50_000), maxOffers: z.number().int().min(1).max(20), incentiveSatang: z.number().int().min(0) }))
    .min(1)
    .max(6),
  /** What to do when contribution margin < minimum: refuse the vehicle option, or add a platform service fee. */
  marginGuardMode: z.enum(['BLOCK', 'SERVICE_FEE']).default('BLOCK'),
  holidays: z
    .array(z.object({ date: z.string().date(), label: z.string().max(60), milli: z.number().int().min(1000).max(3000) }))
    .default([]),
  /** Lower score = better candidate. Weights are applied to normalised components. */
  dispatchWeights: z
    .object({
      pickupEta: z.number().min(0).max(10),
      deadMileage: z.number().min(0).max(10),
      reliability: z.number().min(0).max(10),
      rating: z.number().min(0).max(10),
      zoneMismatch: z.number().min(0).max(10),
      workload: z.number().min(0).max(10),
      direction: z.number().min(0).max(10),
    })
    .default({ pickupEta: 1, deadMileage: 0.5, reliability: 0.6, rating: 0.3, zoneMismatch: 0.2, workload: 0.5, direction: 0.2 }),
  /** Minutes before scheduled pickup to start dispatching. */
  scheduledDispatchLeadMin: z.number().int().min(5).max(240).default(30),
  pickupGeofenceM: z.number().int().min(50).max(5000),
  dropoffGeofenceM: z.number().int().min(50).max(5000),
  surge: z.object({
    enabled: z.boolean(),
    minMilli: z.number().int().min(1000).max(5000),
    maxMilli: z.number().int().min(1000).max(5000),
    cooldownSeconds: z.number().int().min(60).max(7200),
  }),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;
