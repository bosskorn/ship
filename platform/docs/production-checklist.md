# ก่อนเปิดใช้งานจริง (Production checklist)

สิ่งที่ MVP ยัง **ไม่ได้ทำ** หรือเป็น placeholder — เรียงตามความเสี่ยงต่อการเปิดบริการ

## ต้องทำก่อน pilot กับลูกค้าจริง
1. **Payment gateway จริง** — QR (PromptPay) และบัตรตอนนี้เป็น mock adapter (`payments/payment.adapters.ts`) และถูกปิดอัตโนมัติใน production; เพิ่ม adapter (เช่น Omise / 2C2P / GB Prime Pay) พร้อม webhook signature verification, reconciliation รายวัน
2. **SMS gateway** สำหรับ OTP (`notifications/providers.ts` → `SmsSender`) — ปัจจุบัน log อย่างเดียว
3. **Push**: ตั้งค่า EAS project, `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN`, FCM/APNs credentials
4. **รันแอปบนเครื่องจริง** (Android ระดับล่าง + iPhone): background location ตอนจอดับ, Doze/battery optimisation (Xiaomi/Oppo/Vivo), สิทธิ์ "Always", offer ขณะแอปอยู่เบื้องหลัง — แอปถูก typecheck/bundle แล้วแต่ยังไม่ได้ทดสอบบน device
5. **Object storage**: เปลี่ยน `LocalStorage` เป็น S3-compatible (R2/S3/OBS) + presigned URL; เปิด lifecycle/retention สำหรับ KYC ตาม PDPA
6. **Secrets**: สร้าง `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `HASH_PEPPER`, `UPLOAD_SIGNING_SECRET` จริงใน secret manager; วางแผน key rotation ของ `DATA_ENCRYPTION_KEY` (รูปแบบ `v1:` รองรับ versioning)
7. **Admin 2FA enrolment UI** — backend รองรับ TOTP แล้ว แต่ยังไม่มีหน้าลงทะเบียน (production บังคับ ADMIN ต้องมี TOTP)
8. **Map tiles สำหรับ ops-web** — ตอนนี้ใช้ tile.openstreetmap.org (ห้ามใช้ปริมาณมากตาม OSM tile policy) → ใช้ tile server ของตัวเองหรือ provider เชิงพาณิชย์
9. **Google Maps API key** สำหรับแอป Android (`app.json`)
10. **OSRM** สำหรับประเทศไทย + profile มอเตอร์ไซค์ (`infra/osrm`) — ตอนนี้ค่า default เป็น haversine
11. **PDPA**: privacy notice, consent ตำแหน่ง/กล้อง, นโยบายเก็บ/ลบข้อมูล, DPA กับผู้ให้บริการ

## ความเสถียร / ขยายระบบ
- Transactional outbox แทน in-process event emit (ตอนนี้ emit หลัง commit; ถ้า process ตายระหว่างนั้น sweeper ช่วยกู้ dispatch ได้ แต่ notification อาจหาย)
- Partition `driver_location_history` รายวัน + retention, หรือย้ายไป TimescaleDB
- Load test: GPS ingest (คนขับ 5k × ทุก 5 วิ), dispatch latency, socket fan-out ผ่าน Redis adapter
- Error tracking (Sentry), dashboard Grafana จาก `/metrics`, alert เมื่อ queue ค้าง/time-to-match สูง
- Masked calling (voice proxy) แทนการเปิดเบอร์คนขับให้ลูกค้าระหว่างงาน
- Cancellation fee / waiting fee capture (ตั้งค่าใน pricing rule แล้ว แต่ยังไม่คิดเงินจริง)
- Return flow UI (`RETURNING/RETURNED` มีใน state machine)
- Geocoding ภาษาไทยคุณภาพสูง (ตอนนี้ใช้ geocoder ของ OS)

## Phase 2 (ตามสเปก §42)
Driver tier automation · Incentive programs · Wallet · Settlement (ตาราง `settlements` พร้อม) · Promotions เต็มรูป (ตอนนี้: fixed/percent code, budget, per-user limit) · Fraud rules เพิ่ม · Business account · Bulk upload

## Phase 3 (§43)
VROOM route optimisation · Corporate credit · Public API/Webhooks · Advanced dispatch (batching) · Heatmap · Demand forecasting · Dynamic pricing · Automated incentives
