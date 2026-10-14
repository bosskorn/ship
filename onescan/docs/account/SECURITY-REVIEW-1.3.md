# OneScan 1.3 Account Foundation — Security Review (Checkpoint E)

ขอบเขต: branch `claude/account-1.3` — `backend/supabase` (schema/config), `backend/api` (Cloudflare Worker), `src/services/auth`, `src/features/account`, `src/core/identity`, migration v3
อ้างอิง: OWASP MASVS (AUTH, STORAGE, NETWORK, PRIVACY), ACCOUNT-1.3-SPEC §10 threat model
ผล: **ไม่พบ issue ระดับ Critical/High ที่ยังเปิดอยู่** · มี Medium 2 ข้อที่ต้องปิดก่อน Production (M1, M2) · Low/Info บันทึกไว้

## ตรวจแล้วผ่าน

| # | หัวข้อ | หลักฐาน |
| --- | --- | --- |
| 1 | ไม่สร้างระบบ auth แข่ง Supabase: ไม่มี password hash, credential table, reset/verification token ของเราเอง | migration ไม่มีคอลัมน์ password (SQL test), Supabase จัดการทั้งหมด |
| 2 | Password ไม่ถูกเก็บ/ไม่ถูก log ที่ใดในแอปหรือ API | ส่งตรงไป Supabase ทาง HTTPS; Worker ไม่มี endpoint รับ password |
| 3 | Refresh token เก็บใน SecureStore (Android Keystore) `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; access token อยู่ใน memory เท่านั้น; Auto Backup ปิดอยู่แล้ว | `sessionStore.ts`; test "stores only the refresh token…" |
| 4 | Token rotation + reuse detection | Supabase `enable_refresh_token_rotation`, `refresh_token_reuse_interval=10`; client บันทึก token ใหม่ทุกครั้ง (test rotation); reused token → SESSION_EXPIRED (test) |
| 5 | Access token 15 นาที, inactivity 30 วัน, absolute 90 วัน | `jwt_expiry=900`; client บังคับ (tests 30/90 วัน); server บังคับด้วย `app.enforce_session_policy()` ทุกชั่วโมง (SQL test) |
| 6 | Revoke: logout เครื่องนี้ / อุปกรณ์อื่น / ทุกอุปกรณ์ ลบแถว `auth.sessions` → refresh token ใช้ไม่ได้ทันที | SQL tests revoke/logout/revoke_all |
| 7 | Authorization: ทุก function ใน schema `app` กรองด้วย provider `sub` ของผู้เรียก; ข้ามผู้ใช้ไม่ได้ | SQL test "cross-user revoke refused"; API ส่ง session จาก JWT ไม่ใช่จาก body (test) |
| 8 | Schema `app`: RLS เปิดทุกตาราง, ไม่มี policy, ไม่มีสิทธิ์ให้ `anon`/`authenticated`; deletion job เรียกจาก API ไม่ได้ | SQL test "Roles" |
| 9 | Service-role key อยู่ใน Worker secret เท่านั้น; แอปมีแค่ anon key (public โดยออกแบบ) | `wrangler.toml` ไม่มี secret; test "goTrue sends the anon key" |
| 10 | JWT verify: ลายเซ็น (JWKS ES256/RS256 หรือ HS256 legacy), issuer, audience, expiry, role, session_id | API tests (key อื่น/issuer อื่น/หมดอายุ/ไม่มี session/role anon → 401) |
| 11 | ลบบัญชีต้องยืนยันรหัสผ่านภายใน 5 นาที (`amr.password.timestamp`) | API test "needs a password sign-in within 5 minutes" |
| 12 | Rate limit: Supabase (ส่งอีเมล 30/ชม., sign-in/up 30/ชม., verify 30/ชม., refresh 150/ชม., อีเมลต่อที่อยู่ 1/นาที) + Worker 60/นาที/ผู้ใช้, 5/นาที สำหรับ revoke/ลบบัญชี; แอปมี resend cooldown 60 วิ | config.toml, wrangler.toml, API test 429, UI test cooldown |
| 13 | Forgot password ตอบเหมือนกันทุกกรณี | UI test neutral text |
| 14 | ไม่ log ข้อมูลอ่อนไหว: Worker log เฉพาะ route+status; audit ไม่มี password/OTP/token/เนื้อหาเอกสาร/IP ดิบ | API test "logs carry neither tokens nor emails"; schema audit |
| 15 | Email link token อยู่ใน URL fragment → ไม่ถึง server/log ของ Worker; หน้า bridge มี CSP `default-src 'none'`, `no-store`, `noindex`; ตรวจรูปแบบ token ก่อนส่งต่อ | `link.ts`, API test, `parseLink` test |
| 16 | Input validation + body ≤ 4 KB + control chars ตัดทิ้ง | API tests |
| 17 | Error ที่ผู้ใช้เห็นเป็นข้อความของ OneScan เสมอ ไม่ใช่ raw Supabase/API | `mapAuthError`, UI tests TH/EN |
| 18 | Login ≠ Upload: ไม่มี endpoint รับเอกสาร; account layer ไม่ import document engine/ไฟล์/encryption | API test 404 สำหรับ /documents,/upload,/ocr,/sync; static isolation tests |
| 19 | Encryption ไม่ถูกแตะ: ทุก flow (รวม reset password, logout, ลบบัญชี) ไม่เรียก native key/ไฟล์/document repository | spies ใน `accountAuth.test.ts` afterEach |
| 20 | Offline/Backend ล่ม ≠ Scanner ล่ม: ไม่มี network ตอนเปิดแอป; account init อ่านเครื่องอย่างเดียวและทำเมื่อเปิดแท็บ ฉัน | `accountIsolation.test.tsx`; offline/server-error tests |
| 21 | Data minimisation: อีเมล, รุ่นเครื่อง, เวอร์ชันแอป, installation id สุ่ม (ไม่ใช่ hardware id) | `installation.ts`, `register_device` |
| 22 | ลบบัญชี: 14 วัน grace, revoke ทุก session ทันที, hard delete + pseudonymise audit (salted SHA-256) | SQL test deletion lifecycle |

## ต้องปิดก่อน Production 1.3.0

| # | ระดับ | เรื่อง | แผน |
| --- | --- | --- | --- |
| M1 | Medium · **โค้ดพร้อม รอโดเมน** | ลิงก์ในอีเมลเปิดแอปผ่าน custom scheme `onescan://` แอปอื่นที่ลงทะเบียน scheme เดียวกันอาจดัก `token_hash` ได้ (ผลกระทบจำกัด: token ใช้ครั้งเดียว อายุ 1 ชม.) | ใช้ Android App Links (https ที่ verify แล้ว) บนโดเมนจริง: Worker เสิร์ฟ `/.well-known/assetlinks.json` แล้ว (ต้องใส่ fingerprint ของ Play app-signing key) + เพิ่ม intent-filter `autoVerify` ใน app config เมื่อได้โดเมน — ทำแล้ว: `EXPO_PUBLIC_APP_LINK_HOST`, `app.config.js`, ปฏิเสธ `onescan://` เมื่อมี host, Worker `/auth/link` ไม่ส่งต่อ custom scheme, `scripts/verify-app-links.mjs`; เหลือ: โดเมนจริง + deploy + Play signing fingerprint + ตรวจบนเครื่อง |
| M2 | Medium · **เปิดอยู่** | ข้อความ Terms/Privacy (ตอนนี้แสดงในแอปแล้ว แต่ยังเป็น Product Draft) ใน `backend/api/src/legal.ts` เป็นร่างที่ตรงกับการทำงานจริง แต่ยังไม่ผ่านการตรวจทางกฎหมาย (PDPA) และ Google Play ต้องการหน้าเว็บสำหรับขอลบบัญชี + Data safety form | Owner/ที่ปรึกษาตรวจข้อความ, เพิ่มหน้าเว็บลบบัญชี + ช่องทางติดต่อ, กรอก Data safety (email, device info, account management) |

## Low / Info (บันทึกไว้)

| # | เรื่อง | หมายเหตุ |
| --- | --- | --- |
| L1 | สมัครด้วยอีเมลที่มีบัญชีแล้วจะแจ้งว่า "มีบัญชีอยู่แล้ว" (เปิดเผยการมีอยู่ของอีเมล) | เป็นข้อกำหนดของ Owner (Validate "Email ซ้ำ"); ลดความเสี่ยงด้วย rate limit; forgot password ยังเป็นกลาง |
| L2 | `LOGIN_FAILED` ไม่ถูกเขียนลง `app.audit_events` | Supabase ไม่บันทึก login ที่ล้มเหลวลงฐานข้อมูล; ดูได้ใน Supabase Auth logs; การ proxy login ผ่าน Worker จะทำลาย rate limit ต่อ IP ของ Supabase จึงไม่ทำ |
| L3 | หลัง revoke อุปกรณ์ access token ที่ออกไปแล้วยังผ่านการตรวจลายเซ็นได้จนหมดอายุ (≤ 15 นาที) | refresh ถูกตัดทันที และ `/v1/me` ตรวจว่า session ยังอยู่ (`app.me` p_session) → เครื่องที่ถูก revoke เห็น "เซสชันหมดอายุ" ทันทีที่เปิดแท็บ ฉัน; endpoint อื่นยังพึ่งอายุ token สั้น |
| L4 | Leaked-password check (HIBP) และ CAPTCHA ยังไม่เปิด | HIBP เป็นฟีเจอร์ Supabase Pro; CAPTCHA (Turnstile) ต้องเพิ่มใน UI — แนะนำเมื่อมีสัญญาณ abuse |
| L5 | Session timebox/inactivity ใน `config.toml` เป็นฟีเจอร์ Supabase Pro | Free plan ยังปลอดภัยเพราะ `app.enforce_session_policy()` (pg_cron) + client บังคับซ้ำ |
| L6 | ไม่มี certificate pinning | ใช้ TLS ของระบบตามปกติ; ข้อมูลที่ส่งไม่มีเอกสาร |
| L7 | `TOKEN_REFRESH` ไม่ถูก audit ทุกครั้ง | ตั้งใจ (ปริมาณสูง); การ reuse token ถูกจับโดย Supabase |
| L9 | Host Supabase Edge Functions (QA): rate limit นับต่อ instance, `/auth/link` เป็น 302 แทนหน้า bridge, ลิงก์อีเมลแม่แบบเริ่มต้นส่ง session (access/refresh token) ใน URL fragment ไปที่ `onescan://` | fragment ไม่ถึง server; แอปตรวจ token กับ Supabase ก่อนใช้ และไม่สลับเครื่องไปบัญชีอื่นที่ไม่ได้รอยืนยัน (กัน login CSRF, มี test); Production ใช้แม่แบบ `token_hash` + App Links (M1) |
| L8 | Worker endpoint ที่ไม่ต้อง auth (`/auth/link`, `/legal/*`, assetlinks, health) ไม่มี rate limit | เป็นหน้า static ไม่เรียก backend; ใช้ Cloudflare WAF/rate rules ได้ถ้าจำเป็น |

## ไม่เปลี่ยน (ยืนยัน)
CameraX/Camera pipeline · DocSeg · Crop ML · OCR · PDF · AES-256-GCM / Android Keystore data key · SQLCipher key · FTS5 · migrations v1–v2 (hash ตรวจใน test) — migration v3 เพิ่มตาราง `app_meta` อย่างเดียว
