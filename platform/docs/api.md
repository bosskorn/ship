# API reference (generated from controllers)

Base URL: `PUBLIC_BASE_URL` (dev `http://localhost:4000`). Auth: `Authorization: Bearer <accessToken>`. Errors: `{statusCode, code, message, details?}`. Money fields are integer **satang**.


## auth

| Method | Path | Roles | Handler |
|---|---|---|---|
| POST | `/auth/otp/request` | public | requestOtp |
| POST | `/auth/otp/verify` | public | verifyOtp |
| POST | `/auth/staff/login` | public | staffLogin |
| POST | `/auth/refresh` | public | refresh |
| POST | `/auth/logout` | any authenticated | logout |
| POST | `/auth/push-token` | any authenticated | pushToken |
| GET | `/auth/me` | any authenticated | me |

## customers

| Method | Path | Roles | Handler |
|---|---|---|---|
| PATCH | `/me/profile` | CUSTOMER | updateProfile |
| GET | `/me/addresses` | CUSTOMER | addresses |
| POST | `/me/addresses` | CUSTOMER | addAddress |
| DELETE | `/me/addresses/:id` | CUSTOMER | deleteAddress |
| GET | `/me/notifications` | any authenticated | notifications |
| GET | `/zones/lookup` | any authenticated | lookup |
| GET | `/catalog/vehicles` | public | vehicles |

## drivers

| Method | Path | Roles | Handler |
|---|---|---|---|
| GET | `/driver/me` | DRIVER | me |
| PUT | `/driver/profile` | DRIVER | profile |
| POST | `/driver/vehicles` | DRIVER | vehicle |
| POST | `/driver/documents` | DRIVER | document |
| POST | `/driver/kyc/submit` | DRIVER | submitKyc |
| POST | `/driver/presence` | DRIVER | presence |
| POST | `/driver/location` | DRIVER | location |
| GET | `/driver/offers` | DRIVER | offers |
| POST | `/driver/offers/:id/accept` | DRIVER | accept |
| POST | `/driver/offers/:id/decline` | DRIVER | decline |
| GET | `/driver/orders/active` | DRIVER | active |
| GET | `/driver/orders/history` | DRIVER | history |
| POST | `/driver/orders/:id/arrive-pickup` | DRIVER | arrivePickup |
| POST | `/driver/orders/:id/pickup` | DRIVER | pickup |
| POST | `/driver/orders/:id/stops/:stopId/arrive` | DRIVER | arriveStop |
| POST | `/driver/orders/:id/stops/:stopId/complete` | DRIVER | completeStop |
| POST | `/driver/orders/:id/cancel` | DRIVER | cancel |
| GET | `/driver/earnings` | DRIVER | earningsSummary |
| GET | `/driver/earnings/items` | DRIVER | earningsItems |

## health

| Method | Path | Roles | Handler |
|---|---|---|---|
| GET | `/health` | public | health |
| GET | `/metrics` | public | scrape |

## ops

| Method | Path | Roles | Handler |
|---|---|---|---|
| GET | `/ops/live` | OPS, ADMIN | live |
| GET | `/ops/kpis` | OPS, ADMIN | kpis |
| GET | `/ops/orders` | OPS, ADMIN | orders |
| GET | `/ops/orders/:id` | OPS, ADMIN | order |
| GET | `/ops/orders/:id/path` | OPS, ADMIN | path |
| GET | `/ops/orders/:id/candidates` | OPS, ADMIN | candidates |
| POST | `/ops/orders/:id/assign` | OPS, ADMIN | assign |
| POST | `/ops/orders/:id/redispatch` | OPS, ADMIN | redispatch |
| POST | `/ops/orders/:id/cancel` | OPS, ADMIN | cancel |
| GET | `/ops/drivers` | OPS, ADMIN | driverList |
| GET | `/ops/drivers/:id` | OPS, ADMIN | driver |
| GET | `/ops/drivers/:id/sensitive` | ADMIN | sensitive |
| POST | `/ops/drivers/:id/kyc` | ADMIN | kyc |
| POST | `/ops/drivers/:id/tier` | ADMIN | tier |
| POST | `/ops/drivers/:id/adjust-earnings` | ADMIN | adjust |
| GET | `/ops/pricing-rules` | OPS, ADMIN | pricingRules |
| POST | `/ops/pricing-rules` | ADMIN | createPricing |
| PUT | `/ops/pricing-rules/:id` | ADMIN | updatePricing |
| GET | `/ops/commission-rules` | OPS, ADMIN | commissionRules |
| POST | `/ops/commission-rules` | ADMIN | createCommission |
| PUT | `/ops/commission-rules/:id` | ADMIN | updateCommission |
| GET | `/ops/zones` | OPS, ADMIN | zoneList |
| POST | `/ops/zones` | ADMIN | createZone |
| PUT | `/ops/zones/:id` | ADMIN | updateZone |
| GET | `/ops/settings` | OPS, ADMIN | getSettings |
| PUT | `/ops/settings` | ADMIN | putSettings |
| GET | `/ops/surge` | OPS, ADMIN | surgeList |
| GET | `/ops/surge/history` | OPS, ADMIN | surgeHistory |
| POST | `/ops/surge/override` | ADMIN | surgeOverride |
| GET | `/ops/risk-events` | OPS, ADMIN | riskEvents |
| POST | `/ops/risk-events/:id/review` | OPS, ADMIN | reviewRisk |
| GET | `/ops/support-cases` | OPS, ADMIN | supportCases |
| POST | `/ops/support-cases` | OPS, ADMIN | createCase |
| POST | `/ops/support-cases/:id` | OPS, ADMIN | updateCase |
| POST | `/ops/pod/:id/amend` | ADMIN | amendPod |
| GET | `/ops/audit-logs` | ADMIN | auditLogs |

## orders

| Method | Path | Roles | Handler |
|---|---|---|---|
| POST | `/quotes` | CUSTOMER | quote |
| POST | `/orders` | CUSTOMER | create |
| GET | `/orders` | CUSTOMER | list |
| GET | `/orders/:id` | any authenticated | get |
| GET | `/orders/:id/timeline` | any authenticated | timeline |
| GET | `/orders/:id/tracking` | any authenticated | trackingSnapshot |
| GET | `/orders/:id/payment` | CUSTOMER | payment |
| POST | `/orders/:id/cancel` | CUSTOMER | cancel |
| POST | `/orders/:id/rate` | CUSTOMER | rate |
| GET | `/me/recent-locations` | CUSTOMER | recentLocations |

## payments

| Method | Path | Roles | Handler |
|---|---|---|---|
| POST | `/payments/webhooks/:provider` | public | webhook |

## uploads

| Method | Path | Roles | Handler |
|---|---|---|---|
| POST | `/uploads/sign` | any authenticated | sign |
| PUT | `/uploads/put/:key` | public | put |
| GET | `/files/:key` | public | get |

## Socket.IO

Connect with `auth: { token: accessToken }`. Rooms are joined server-side: `user:<id>` always, `ops` for OPS/ADMIN, `order:<id>` via `order:subscribe` (access-checked).

| Event | Direction | Payload |
|---|---|---|
| `offer:new` | server → driver | `JobOfferPayload` |
| `offer:revoked` | server → driver | `{offerId, orderId, reason}` |
| `order:updated` | server → customer/driver/order room | `{orderId, status, at, driver}` |
| `driver:location` | server → order room | `{orderId, driverId, lat, lng, heading, ts, etaSeconds}` |
| `ops:order-updated` / `ops:driver-location` / `ops:alert` | server → ops | see `packages/shared/src/realtime.ts` |
| `order:subscribe` / `order:unsubscribe` | client → server | `{orderId}` (ack `{ok}`) |
| `location:ping` | driver → server | `LocationPing` (foreground; background uses `POST /driver/location`) |
