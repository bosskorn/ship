# Ship — Thailand On-Demand Delivery Platform (MVP)

แพลตฟอร์มส่งของ On-Demand / Same-Day สำหรับประเทศไทย พัฒนาใหม่ทั้งหมด (ไม่เกี่ยวข้องกับ Senddee — ไม่ใช้ฐานข้อมูล บัญชี Wallet หรือ Branding ใด ๆ)
ชื่อ “Ship” เป็นชื่อชั่วคราวของโปรเจกต์ เปลี่ยนได้ภายหลัง

Prototype นี้พิสูจน์ **Marketplace Core** ตาม Definition of Done (§46) ได้ครบวงจรและรันจริง:

```
Customer สร้างงาน → Server Quote → Confirm → SEARCHING_DRIVER → Driver ได้รับ Job Offer → Accept
→ Customer เห็นคนขับบนแผนที่ → ถึงจุดรับ → Pickup OTP/รูป/GPS → GPS Tracking → ถึงปลายทาง
→ POD (OTP/รูป/ลายเซ็น/GPS) → DELIVERED → บันทึกรายได้คนขับ → Operations เห็น Timeline ทั้งหมด
```

`pnpm demo` รัน flow นี้ผ่าน HTTP + Socket.IO จริง (ไม่ mock) และ `scenarios` ทดสอบกรณีขอบ 11 กรณี — ดู [การทดสอบ](#การทดสอบ)

---

## สิ่งที่มีในชุดนี้

| ส่วน | เทคโนโลยี | สถานะ |
|---|---|---|
| `apps/api` Backend Platform | NestJS 11 + TypeScript, PostgreSQL 16 + PostGIS 3.4, Redis, BullMQ, Socket.IO | ทำงานจริง ทดสอบ E2E แล้ว |
| `apps/ops-web` Operations/Admin | React 19 + Vite + TDesign React + Leaflet | ทำงานจริง (ตรวจด้วย Playwright screenshot) |
| `apps/customer-app` แอปลูกค้า | Expo SDK 57 / React Native 0.86, expo-router | typecheck + Metro bundle (Android/iOS) + expo-doctor ผ่าน · **ยังไม่ได้รันบนเครื่องจริง** |
| `apps/driver-app` แอปคนขับ | Expo SDK 57, background location, camera, push | typecheck + Metro bundle + expo-doctor ผ่าน · **ยังไม่ได้รันบนเครื่องจริง** |
| `packages/shared` | State machine, money (satang), zod schemas, Thai labels, realtime contracts | unit tests |
| `packages/mobile-ui` | UI kit (TDesign-inspired) + API client (token ใน Keychain/Keystore) | ใช้ร่วมกันทั้งสองแอป |

ไม่มี WebView wrapper — UI มือถือเป็น React Native components ทั้งหมด

## Architecture

```
 Customer App ─┐                      ┌──────────────── Core Backend (NestJS, modular monolith) ────────────────┐
 Driver App  ──┼─ HTTPS / Socket.IO ──┤ Auth · Customer · Driver/KYC · Vehicle · Address · Zones               │
 Ops Web     ──┘                      │ Quote/Pricing/GP/Margin guard/Surge · Order (state machine)             │
                                      │ Dispatch (scoring, waves) · Tracking (GPS) · Delivery (POD)             │
                                      │ Payments (adapters) · Earnings · Notifications · Risk · Audit · Ops     │
                                      └──────┬───────────────────────┬───────────────────────┬─────────────────┘
                                             │                       │                       │
                                PostgreSQL + PostGIS        Redis (presence cache,      RoutingProvider
                                (source of truth, money     locks, rate limit, socket   (OSRM → fallback haversine)
                                 NUMERIC, append-only        adapter, BullMQ queues)    RouteOptimizer (VROOM later)
                                 POD/audit/timeline)
```

- **Server เป็น Source of Truth**: ราคา, GP, รายได้คนขับ, สถานะออเดอร์ คำนวณ/เปลี่ยนที่ server เท่านั้น client ส่งได้แค่ “intent + หลักฐาน”
- **Modular monolith**: โมดูลแยกโฟลเดอร์ตามโดเมน (`apps/api/src/modules/*`) แยกเป็น service ได้ภายหลังโดยไม่ต้องรื้อ business logic
- **API Gateway**: MVP ใช้ NestJS เป็น edge โดยตรง (CORS, rate limit, auth guard); production วาง managed gateway / WAF ข้างหน้าได้
- Domain events (EventEmitter) ถูก emit **หลัง COMMIT** เท่านั้น (`DbService.tx(..., onCommit)`) ไปยัง Notifications, Realtime, Dispatch

รายละเอียดการ map สเปกแต่ละข้อ → โค้ด: [`docs/spec-traceability.md`](docs/spec-traceability.md) · API: [`docs/api.md`](docs/api.md) · สิ่งที่ต้องทำก่อน production: [`docs/production-checklist.md`](docs/production-checklist.md)

## เริ่มต้นใช้งาน (Local)

ต้องมี Node 22, pnpm 10, Docker (หรือ PostgreSQL 16 + PostGIS และ Redis 7 ในเครื่อง)

```bash
cd platform
docker compose up -d db redis          # PostGIS + Redis
pnpm install
pnpm build:shared
cp apps/api/.env.example apps/api/.env # ค่า dev เท่านั้น
pnpm --filter @ship/api build
pnpm migrate && pnpm seed              # schema + โซนนำร่องกรุงเทพฯ, ราคา, GP tiers, บัญชี staff
pnpm dev:api                           # http://localhost:4000  (GET /health)
pnpm dev:ops                           # http://localhost:5173  admin@ship.local / ChangeMe!2026 (dev)
```

แอปมือถือ (ต้องใช้ development build เพราะมี native modules: maps, background location, camera):

```bash
cd apps/driver-app   # หรือ apps/customer-app
EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000 npx expo run:android   # หรือ run:ios
```

> Android ต้องตั้ง `GOOGLE_MAPS_ANDROID_API_KEY` (ใน `app.json` → `android.config.googleMaps`). Push notification ต้องผูก EAS projectId — ระหว่างนั้นงานใหม่/สถานะยังมาทาง Socket.IO ขณะเปิดแอป

### Simulator สำหรับ demo หน้าจอ Operations

```bash
cd apps/api
SIM_DRIVERS=14 SIM_ORDERS_PER_MIN=8 SIM_MINUTES=10 node --env-file=.env dist/scripts/simulate-drivers.js
```

บอทคนขับวิ่งในกรุงเทพฯ รับ/ปฏิเสธ/ปล่อยหมดเวลา ส่งงานจริงผ่าน API — ใช้ดู Live Map, KPI, Dispatch ได้ทันที

## การทดสอบ

| คำสั่ง | ทดสอบอะไร |
|---|---|
| `pnpm -r test` | Unit: money/state machine, pricing formula, GP resolution, margin guard, surge, dispatch scoring, optimizer, earnings periods |
| `pnpm demo` (`apps/api`) | **Definition of Done §46** end-to-end ผ่าน HTTP + Socket.IO |
| `node dist/scripts/scenarios.js` | Decline → wave ถัดไปทันที · 3 คนกดรับพร้อมกันได้ 1 คน · ไม่มีคนขับ → NO_DRIVER → ops จัดเอง (audit) · คนขับยกเลิก → หาคนใหม่ · QR payment webhook · multi-stop (optimize, ห้ามข้ามลำดับ, POD ด้วยรูป+ชื่อ) · state/ownership/geofence · idempotency · refresh token reuse · OTP lockout · upload security |
| `pnpm -r typecheck` | ทุก package รวมแอปมือถือ |
| CI | `.github/workflows/platform-ci.yml` รันทั้งหมดข้างบน + build ops-web + Metro bundle ทั้งสองแอป |

ผลล่าสุดในเครื่องพัฒนา: unit 30/30, demo ผ่าน, scenarios 11/11, expo-doctor 21/21 ทั้งสองแอป

## หลักการออกแบบที่สำคัญ

**เงิน** — คำนวณเป็น integer สตางค์ใน TypeScript, เก็บเป็น `NUMERIC(14,2)` ใน PostgreSQL, ไม่มี floating point; `pg` ตั้งค่าให้คืน NUMERIC เป็น string (`packages/shared/src/money.ts`)

**ราคา (§9)** — `Base + Distance + Vehicle + Additional stops + Special services + Traffic + Demand(surge × peak/night/holiday) + Toll − Promotion`, ปัดเป็นบาทเต็ม, Quote มี ID และหมดอายุ (default 5 นาที) ใช้ได้ครั้งเดียว (`pricing.engine.ts`)

**Margin guard (§11)** — `Contribution margin = ลูกค้าจ่าย − รายได้คนขับ − payment fee − insurance/risk − ต้นทุนแปรผันอื่น` (promotion subsidy และ incentive รวมอยู่แล้ว) ถ้าต่ำกว่า minimum: ลดโปรโมชันก่อน → ถ้ายังต่ำ `BLOCK` (ไม่ขายตัวเลือกนั้น) หรือ `SERVICE_FEE` ตามที่ admin ตั้ง, override ได้เฉพาะ pricing rule ที่เปิด `allowBelowMargin` (audit) — margin จริงถูกบันทึกบนทุก order หลังได้คนขับ

**GP (§10)** — กฎตาม คนขับ/Tier/รถ/โซน/แคมเปญ/ช่วงเวลา, priority สูงสุดชนะ เท่ากันใช้กฎที่เฉพาะเจาะจงกว่า; seed: NEW 0%, STANDARD 8%, SILVER 7%, GOLD 6%, PRO 5% — แก้ได้ใน Ops โดยไม่ deploy

**Dispatch (§18–19)** — ไม่ใช่ “ใกล้สุด” อย่างเดียว: score = ETA + dead mileage + reliability (acceptance/cancellation) + rating + zone + workload + ทิศทางการวิ่ง (น้ำหนักปรับได้) · ส่งเป็น wave (3 คน/3 กม. → 5 คน/6 กม. → 8 คน/10 กม. + incentive) → `NO_DRIVER` + แจ้ง Ops · Accept ใช้ Redis lock + row lock ป้องกันรับซ้ำ · ทุก (round, wave) idempotent · sweeper ช่วยกู้งานค้าง

**State machine (§14, §36)** — ตารางเดียวใน `packages/shared/src/order-state.ts` กำหนดว่า actor ไหนเปลี่ยนสถานะไหนได้ `OrderStateService` เป็นที่เดียวที่เขียน `orders.status` และบันทึก `tracking_events` (append-only) ทุกครั้ง

**Pickup/POD (§15–16)** — geofence (default 300 ม.) อยู่นอกเขตต้องให้เหตุผล → risk event + แจ้ง Ops · Pickup: OTP/QR/รูป + GPS · Delivery: OTP/QR หรือ รูป+ชื่อผู้รับ, ลายเซ็น, GPS · ตาราง `pod` ห้าม UPDATE/DELETE ด้วย trigger, admin แก้ผ่าน `pod_amendments` + audit · ไฟล์หลักฐานต้องเป็นของคนขับคนนั้นและอัปโหลดผ่าน signed URL จริง

**Dead mileage (§20)** — เก็บแยก planned (ตอน assign) / actual (จาก GPS ระหว่าง assign→pickup) / loaded (pickup→delivered) ต่องาน และสรุปใน KPI/รายได้คนขับ

**GPS (§12, §21)** — offline ไม่ส่ง · online รองาน 30 วิ/50 ม. · มีงาน 5 วิ/15 ม. ผ่าน OS background task (foreground service บน Android) ส่งแบบ batch, ETA คำนวณใหม่ไม่เกินทุก 30 วิ/ออเดอร์, ops เห็นตำแหน่ง throttle 5 วิ

**Security (§38)** — OTP hash + rate limit (เบอร์/IP) + จำกัดจำนวนครั้ง · JWT 15 นาที + refresh rotation + reuse detection (revoke ทั้ง session) · device session (คนขับ 1 เครื่อง) · RBAC · PII คนขับเข้ารหัส AES-256-GCM, การเปิดดูถูก audit · signed upload/download URL · Admin 2FA (TOTP, บังคับใน production) · audit log append-only · ไม่มี secret ใน mobile bundle · server ปฏิเสธการ start ใน production ถ้ายังใช้ dev secrets

## โครงสร้างโฟลเดอร์

```
platform/
  apps/api/                 NestJS backend · migrations/ · src/modules/* · src/scripts (migrate, seed, demo, scenarios, simulator)
  apps/ops-web/             Operations dashboard
  apps/customer-app/        Expo (expo-router) — Home | Orders | Activity | Account
  apps/driver-app/          Expo (expo-router) — Home | Jobs | Earnings | Account
  packages/shared/          Domain contracts used everywhere
  packages/mobile-ui/       RN UI kit + API client
  infra/osrm/               OSRM graph build for Thailand
  docker-compose.yml        PostGIS, Redis, API, (optional) OSRM
  docs/                     Spec traceability, API reference, production checklist
```

## Open-source references (§2)

ทีมใช้ Parfly, OwnFleet, BetterRoute และ Delivery App เป็น **reference เชิงแนวคิด** เท่านั้น — โค้ดใน repo นี้เขียนใหม่ทั้งหมด **ไม่ได้ fork หรือคัดลอกโค้ดจาก repository เหล่านั้น** (เซสชันพัฒนานี้ไม่ได้เข้าถึง repo ดังกล่าวด้วย)
หากในอนาคตจะนำโค้ดจากที่ใดมาใช้ ต้องตรวจ license และเก็บ copyright/license notice ไว้ใน `THIRD_PARTY_NOTICES.md` ก่อน merge ตามข้อกำหนด §2

Dependencies ภายนอกทั้งหมดเป็น open-source license แบบ permissive (MIT/Apache-2.0/BSD/ISC) ผ่าน npm; OSRM เป็น BSD-2-Clause; ข้อมูลแผนที่ OpenStreetMap เป็น ODbL (ต้องแสดง attribution — ทำแล้วใน ops-web)
