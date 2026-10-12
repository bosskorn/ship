# Spec → Implementation traceability

สถานะ: ✅ ทำแล้วใน MVP · 🟡 มีโครง/บางส่วน (ระบุว่าขาดอะไร) · ⏭ ตามแผน Phase 2/3

| § | หัวข้อ | สถานะ | ที่อยู่ในโค้ด / หมายเหตุ |
|---|---|---|---|
| 1 | ข้อกำหนดหลัก (ไม่ใช่ Senddee, ไม่ WebView, Native-like, ไทยเป็นหลัก, ขยายทั่วประเทศ, ไม่ clone Lalamove, TDesign, เน้นส่งของ) | ✅ | Expo RN apps, Thai copy ทุกจอ, service zones (PostGIS) |
| 2 | Open-source references / license | ✅ | ไม่ได้ fork/คัดลอก — ดู README § Open-source references |
| 3 | 4 ส่วน: Customer, Driver, Ops, Backend | ✅ | `apps/*` |
| 4 | Mobile stack & capabilities | ✅/🟡 | GPS+background ✅ camera ✅ push ✅(ต้องมี EAS projectId) deep link scheme ✅ secure storage ✅ maps ✅ QR ✅ image upload ✅ OTP ✅ · biometric ⏭ |
| 4 | Backend modules | ✅ | `apps/api/src/modules/*` (Wallet/Settlement/Promotion มีตาราง+ส่วนลดพื้นฐาน, เต็มรูป ⏭) |
| 4 | PostGIS ตั้งแต่แรก | ✅ | `migrations/001_init.sql` geography/geometry + GiST |
| 4 | Redis + Socket.IO + BullMQ | ✅ | `common/redis.service.ts`, `realtime/*`, `common/queue.service.ts` |
| 5 | Customer Home / bottom nav 4 tabs | ✅ | `customer-app/app/(tabs)/*` (Home: current location, quick services, recent locations/orders, saved addresses) |
| 6 | Create flow Pickup→Destination→Parcel→Vehicle→Quote→Payment→Confirm, ขยับหมุด, หลายปลายทาง | ✅ | `customer-app/app/create/*`; UX จำกัด 10 จุด, API/DB รองรับ 20 |
| 7 | Parcel info + รูป | ✅ | `create/parcel.tsx`, `order_items` |
| 8 | Vehicle selection (ราคา, ETA, ความจุ, น้ำหนัก, ขนาด) | ✅ | `create/vehicle.tsx`, `VEHICLE_TH` |
| 9 | Quote engine (server only, ID+expiry, requote) | ✅ | `pricing/pricing.engine.ts`, `quotes/quotes.service.ts` |
| 10 | GP configurable (driver/tier/vehicle/zone/campaign/time) | ✅ | `commission_rules`, `resolveCommission`, Ops → ราคา/GP |
| 11 | Margin guard | ✅ | `applyMarginGuard`; actual CM per order บน `orders.margin` |
| 12 | Driver app nav + Online/Offline + background GPS | ✅ | `driver-app/app/(tabs)/index.tsx`, `lib/location.ts` |
| 13 | Job offer details + countdown | ✅ | `driver-app/components/OfferSheet.tsx`, payload `JobOfferPayload` |
| 14 | Driver states, server-validated | ✅ | `order-state.ts`, `delivery.service.ts` |
| 15 | Pickup verification (OTP/QR/Photo/Timestamp/GPS, ห้ามกดไกล) | ✅ | geofence + override reason + risk event |
| 16 | POD (OTP/รูป/ลายเซ็น/ชื่อ/GPS/เวลา), ห้ามแก้ย้อนหลัง, admin override audit | ✅ | `pod` append-only trigger, `pod_amendments`, `POST /ops/pod/:id/amend` |
| 17 | Driver earnings (gross, GP, bonus, tips, adjustment, net; today/week/month) | ✅ | `earnings.service.ts`, `driver-app/(tabs)/earnings.tsx` |
| 18 | Dispatch scoring (ไม่ใช่ใกล้สุดอย่างเดียว) | ✅ | `dispatch/dispatch.scoring.ts` (weights ใน settings) |
| 19 | Wave strategy → Ops alert → manual | ✅ | `dispatch.service.ts runWave`, settings.dispatchWaves |
| 20 | Dead mileage แยก | ✅ | `assignments.planned/actual_dead_mileage_m`, `loaded_mileage_m`, KPI |
| 21 | Realtime tracking + adaptive GPS | ✅ | `tracking.service.ts`, `GPS_INTERVAL_MS` |
| 22 | OSRM + VROOM, RoutingProvider abstraction | ✅/🟡 | OSRM provider + fallback ✅; VROOM ⏭ (interface `RouteOptimizer` พร้อม, ใช้ heuristic ใน MVP) |
| 23 | Multi-stop + optimize + lock | ✅ | `routing/optimizer.ts`, `optimizeRoute`, `locked` |
| 24 | Scheduled delivery | ✅ | status `SCHEDULED` + delayed job `scheduled-dispatch` (lead ตั้งค่าได้) |
| 25 | Ops Live map + counters | ✅ | `ops-web/src/pages/LivePage.tsx`, `GET /ops/live` |
| 26 | Manual dispatch + audit | ✅ | Order drawer → จัดคนขับเอง, `dispatch.manual_assign` audit |
| 27 | Pricing admin ไม่ต้อง deploy | ✅ | Pricing rules (base, km, min, vehicle, waiting, stop, zone, peak/night/holiday, surge, GP, incentive per wave) |
| 28 | Zone polygons + per-zone config | ✅ | Zones page (วาด polygon), pricing/GP/promotion/service hours/vehicles per zone |
| 29 | Surge (supply/demand, min/max, cooldown, manual override, history) | ✅ | `surge.engine.ts`, `surge_states`, `surge_history` |
| 30 | Driver KYC + statuses + encryption + access control | ✅ | `drivers.service.ts`, AES-GCM, PII view = ADMIN + audit |
| 31 | Fraud signals, risk score, manual review (no auto-ban) | ✅/🟡 | GPS mock, impossible travel, multi-device, repeated cancel, geofence override ✅ · POD fraud/abnormal earnings/promo abuse/account sharing: ประเภทพร้อม, rule ⏭ |
| 32 | Payment adapters (cash/QR/card, wallet/credit ในอนาคต) แยกจาก Order | ✅/🟡 | `payments/*` adapter interface; cash ✅, QR/card เป็น **mock** — ต้องต่อ gateway จริง |
| 33 | Business accounts | ⏭ | `customers.org_id` เผื่อไว้ |
| 34 | Excel/CSV bulk | ⏭ | |
| 35 | Notifications (push/SMS, LINE/email future) แยกจาก order logic | ✅/🟡 | event-driven `notifications.listener.ts`; Expo push ✅, SMS = log adapter (ต้องต่อ gateway) |
| 36 | Order state machine + exceptions, client เปลี่ยนตรงไม่ได้ | ✅ | `RETURNING/RETURNED/FAILED` มีใน state machine; UI สำหรับ return flow ⏭ |
| 37 | ตารางหลัก, UUID, NUMERIC | ✅ | ทุกตารางใน §37 มีครบ (tracking_events = timeline) |
| 38 | Security baseline | ✅ | ดู README § Security; secret management = env/secret store ของ platform |
| 39 | Observability + business metrics | ✅/🟡 | pino structured logs, Prometheus `/metrics` (latency, dispatch, GPS, queue), KPI page ทุกตัวใน §39 · error tracking (Sentry) ต่อเพิ่ม |
| 40 | UI TDesign-inspired | ✅ | tokens `mobile-ui/src/theme.ts`, ops ใช้ TDesign React |
| 41 | Phase 1 MVP scope | ✅ | ทุกข้อในรายการ Sprint แรก |
| 42–43 | Phase 2/3 | ⏭ | ดู production checklist |
| 44 | Launch by zones, targets | ✅ | zones + KPI targets แสดงใน Ops |
| 45 | Driver supply / dispatch / pricing / economics / reliability ทุก order | ✅ | economics บันทึกทุก order (quote margin + actual margin + driver net) |
| 46 | Definition of Done | ✅ | `apps/api/src/scripts/demo-e2e.ts` |
