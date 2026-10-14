# OneScan 1.3 — Account System: Architecture Specification (Draft for Owner Review)

สถานะ: **DRAFT — STOP AND WAIT FOR OWNER APPROVAL** · ยังไม่มี production code
ขอบเขต: OneScan 1.3.x เท่านั้น · 1.2.0 FREEZE (ไม่มี Login ใน Production AAB 1.2.0)
หลักการเดียว: **Backend outage must not become scanner outage** และ **Login ≠ Upload**

ข้อเท็จจริงจาก codebase ปัจจุบันที่ spec นี้อ้างอิง
- เอกสารเก็บเป็นไฟล์เข้ารหัส AES-256-GCM ด้วย data key ที่ห่อด้วย Android Keystore (`SecureFiles.kt`, alias `onescan.kek.v1`); DB เป็น SQLCipher ด้วย key ที่ derive จาก data key เดียวกัน (`db.ts`)
- ตาราง `documents` มี `workspace_id` (สงวนไว้) และ `sync_state DEFAULT 'local_only'` อยู่แล้ว; มีตาราง `sync_state` สำรองไว้; schema v2
- `apiClient` (Cloudflare Workers) มีอยู่แต่ไม่มี auth/timeout; `SyncEngine` เป็น stub ที่บังคับ encrypt ก่อนอัปโหลด; `expo-secure-store` ติดตั้งอยู่แล้ว; permission `INTERNET` มีอยู่แล้ว
- Production gate ปิด `cloudBackup` อยู่; หน้า ฉัน ไม่มีบัญชี

---

## 1. Proposed architecture

```
OneScan Mobile
├── Local Mode (ไม่เปลี่ยน)          Camera · Documents · OCR · PDF · Search(FTS5) · Local Encryption
├── Identity Layer (ใหม่)
│   ├── InstallationIdentity          installation_id (สร้างครั้งแรกที่เปิด, อยู่ใน SQLCipher)
│   ├── AuthService                   state machine + provider adapter (ไม่มี UI logic)
│   ├── SessionStore                  refresh token ใน SecureStore (Keystore-backed)
│   └── DeviceRegistration            ผูก installation ↔ user หลัง login
├── Entitlement Layer (ใหม่)          capabilities() — FREE = local ทั้งหมด; ไม่มี isPremium กระจาย
└── Account UI (ใหม่)                 อยู่ใต้ ฉัน เท่านั้น; ไม่มี popup ตอนเปิดแอป

Backend
├── Identity Provider (managed)       Register · Verify email · Login · Reset · Sessions · Refresh rotation
├── OneScan API (Cloudflare Workers)  User · Device · Entitlement · Account deletion · Audit · Rate limit
├── App DB (Postgres)                 users · devices · entitlements · audit_events · account_deletions
└── Cloud Sync API [future]           ไม่ implement ใน 1.3 (SyncEngine stub คงเดิม)
```

กฎการพึ่งพา (dependency rules)
- Local Mode **ไม่ import** Identity/Entitlement/Backend เลย — แอปเริ่มทำงานได้โดยไม่เรียก network
- Identity Layer เรียก network เฉพาะเมื่อผู้ใช้เปิดหน้า Account หรือเมื่อมี session อยู่แล้ว (refresh แบบ background, timeout สั้น, ไม่ block UI)
- Entitlement คืนค่า FREE แบบ offline เสมอเมื่อไม่มีข้อมูล — core capabilities ไม่มีวันถูกปิดเพราะ backend

## 2. Authentication provider / backend recommendation

**แนะนำ: Supabase Auth (managed, region Singapore) + OneScan API บน Cloudflare Workers + Supabase Postgres สำหรับข้อมูลของแอป**

| เกณฑ์ | Supabase Auth | Firebase Auth | Auth0/Clerk | สร้างเอง (Better Auth/Lucia บน Workers) |
| --- | --- | --- | --- | --- |
| Email+password, verify, reset | ✓ | ✓ | ✓ | ต้องประกอบเอง |
| Refresh rotation + reuse detection | ✓ | จำกัด | ✓ | ต้องทำเอง |
| Revoke session รายเครื่อง / ทั้งหมด | ✓ (session_id ใน JWT, sign-out scope) | revoke ทั้งหมดเท่านั้น | ✓ | ต้องทำเอง |
| Rate limit / CAPTCHA ในตัว | ✓ | ✓ | ✓ | ต้องทำเอง |
| Lock-in | ต่ำ (GoTrue open source, self-host ได้, Postgres มาตรฐาน) | สูง | สูง | ไม่มี |
| ราคาเริ่มต้น / data residency | ต่ำ / SG | ต่ำ / multi | สูง / หลายแห่ง | ต่ำ / เลือกได้ |

เหตุผล
- เป็น mature auth ไม่สร้าง cryptography เอง (ตาม Phase 7) และไม่สร้าง auth tables ซ้ำ (ตาม Phase 14)
- JWT verify ได้ที่ Workers ผ่าน JWKS (ไม่ต้องเรียก provider ทุก request)
- ย้ายออกได้: auth เป็น open source, ข้อมูลแอปอยู่ใน Postgres ปกติ, `user_id` เป็น UUID ของเราเอง (ดู §3)

สิ่งที่ต้องเตรียมนอกโค้ด: โดเมน (เช่น `onescan.app`) สำหรับ Android App Links + หน้า Terms/Privacy/ลบบัญชีบนเว็บ (Play policy), SMTP ที่ส่งได้จริง (Resend หรือ Amazon SES — SMTP ในตัวของ provider ถูกจำกัดจำนวน), Supabase project แยก dev/prod

ทางเลือกสำรองถ้า Owner ไม่ต้องการ vendor: Better Auth บน Workers + Postgres (Neon) — ควบคุมได้เต็มที่ แต่ต้องรับผิดชอบ rate limit, email flows, rotation เอง และต้อง security review มากขึ้น

## 3. Database schema (server)

กฎ ID: `user_id` = UUIDv7 ที่ OneScan สร้างเอง ไม่ใช่ email/phone/username และ **ไม่ใช่ id ของ provider** (`auth_identities` ผูก provider id → user_id เพื่อเปลี่ยน provider ได้ภายหลัง)

ตารางที่ provider จัดการให้แล้ว (ไม่สร้างซ้ำ): credentials/password hash, `sessions`, refresh tokens, `email_verifications`, `password_resets` → OneScan เก็บเฉพาะข้อมูลของแอป

```sql
-- schema app (Postgres)
users (
  user_id            uuid primary key,              -- UUIDv7, immutable
  email_normalized   text not null,                 -- สำเนาเพื่อแสดงผล/ค้นหา; ไม่ใช่ key
  email_verified_at  timestamptz,
  status             text not null default 'active',-- active | pending_deletion | deleted
  locale             text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index on users(email_normalized) where status <> 'deleted';

auth_identities (
  provider           text not null,                 -- 'supabase'
  provider_subject   text not null,                 -- auth.users.id
  user_id            uuid not null references users on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (provider, provider_subject)
);

devices (
  device_id          uuid primary key,              -- UUIDv7
  user_id            uuid not null references users on delete cascade,
  installation_id    uuid not null,                 -- จากแอป; ไม่ใช่ hardware id
  provider_session_id text,                         -- session ที่ผูกกับเครื่องนี้ (สำหรับ revoke)
  platform           text not null,                 -- android | ios
  device_label       text,                          -- "Galaxy S25" (ผู้ใช้แก้ได้)
  app_version        text not null,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  revoked_at         timestamptz,
  unique (user_id, installation_id)
);

entitlements (
  user_id            uuid not null references users on delete cascade,
  plan               text not null default 'FREE',  -- FREE | PLUS | BUSINESS
  capabilities       text[] not null,               -- สำเนาที่คำนวณแล้ว
  source             text not null default 'default', -- default | store | admin
  valid_until        timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id)
);

audit_events (
  id                 bigint generated always as identity primary key,
  user_id            uuid,                          -- null ได้ (เช่น LOGIN_FAILED ที่ไม่รู้ผู้ใช้)
  event              text not null,                 -- ดู §10
  device_id          uuid,
  ip_hash            text,                          -- HMAC(ip, secret) ไม่เก็บ IP ดิบ
  user_agent_class   text,                          -- เช่น 'android/1.3.0'
  meta               jsonb not null default '{}',   -- ห้ามมี password/OTP/token/เนื้อหาเอกสาร
  created_at         timestamptz not null default now()
);

account_deletions (
  user_id            uuid primary key,
  requested_at       timestamptz not null,
  scheduled_for      timestamptz not null,          -- requested + grace
  completed_at       timestamptz,
  source             text not null                  -- app | web | support
);
```

Local (มือถือ) — **migration v3 แบบ additive เท่านั้น**
```sql
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
-- installation_id, account_link (user_id + email สำหรับแสดงผล), last_entitlement (cache)
```
ไม่แตะ `documents/pages/folders/document_fts` ใน 1.3 (เหตุผลใน §6)

## 4. API endpoints

Auth (เรียก provider โดยตรงผ่าน SDK; rate limit + CAPTCHA ที่ provider)
| Flow | Call |
| --- | --- |
| Register | `signUp(email, password)` → ส่งอีเมลยืนยัน (App Link `https://onescan.app/auth/verify`) |
| Verify email | เปิด App Link → `verifyOtp(token_hash, type=signup)` |
| Resend verification | `resend(type=signup)` · cooldown 60 วิ ฝั่งแอป + limit ฝั่ง provider |
| Login | `signInWithPassword` |
| Refresh | `refreshSession` (rotation, reuse detection) |
| Forgot / reset | `resetPasswordForEmail` → App Link `/auth/reset` → `updateUser(password)` |
| Logout (เครื่องนี้) | `signOut(scope=local)` + `POST /v1/devices/current/revoke` |
| Logout ทุกเครื่อง | `signOut(scope=global)` + `POST /v1/devices/revoke-all` |

OneScan API (Workers, `Authorization: Bearer <access JWT>`, ทุก endpoint มี rate limit ต่อ user + ต่อ IP)
| Method | Path | หน้าที่ |
| --- | --- | --- |
| POST | `/v1/me/bootstrap` | หลัง login ครั้งแรก: สร้าง/คืน `users` + `auth_identities` (idempotent) |
| GET | `/v1/me` | email, status, verified, plan |
| GET | `/v1/me/entitlements` | plan + capabilities + `valid_until` |
| POST | `/v1/devices/register` | `{installation_id, platform, app_version, device_label}` → upsert device + ผูก session id |
| POST | `/v1/devices/heartbeat` | อัปเดต `last_seen_at`, `app_version` (เมื่อเปิดแอปและมี session, ไม่เกินวันละครั้ง) |
| GET | `/v1/devices` | อุปกรณ์ของฉัน |
| POST | `/v1/devices/{id}/revoke` | ออกจากระบบอุปกรณ์นั้น (ปิด provider session ของเครื่องนั้น) |
| POST | `/v1/devices/revoke-all` | ออกจากระบบทุกอุปกรณ์ |
| POST | `/v1/account/delete` | ขอลบบัญชี (ต้อง re-auth ภายใน 5 นาที) |
| POST | `/v1/account/delete/cancel` | ยกเลิกภายใน grace period |
| GET | `/v1/health` | สำหรับแสดง "บริการบัญชีไม่พร้อมใช้งาน" |

ทุก response ไม่มีข้อมูลเอกสาร; ไม่มี endpoint ใดรับเนื้อหาเอกสารใน 1.3

## 5. Token / session lifecycle

| ส่วน | ค่า |
| --- | --- |
| Access token (JWT) | อายุ 15 นาที; อยู่ในหน่วยความจำเท่านั้น |
| Refresh token | อายุ 30 วันนับจากใช้ล่าสุด (inactivity) · สูงสุด 90 วัน; หมุนทุกครั้งที่ใช้; reuse = revoke ทั้ง session family |
| ที่เก็บบนมือถือ | `expo-secure-store` (EncryptedSharedPreferences + Android Keystore), `requireAuthentication: false`, ไม่ backup (Auto Backup ปิดอยู่แล้ว) |
| Refresh เมื่อไหร่ | lazy: ก่อนเรียก API เมื่อเหลือ < 60 วิ; ไม่มี refresh ตอน app start ถ้าผู้ใช้ไม่เข้า Account |
| Offline | ใช้ข้อมูลบัญชีที่ cache (email/plan) แสดงผล = `OFFLINE_AUTHENTICATED`; ไม่ถือว่าหมดอายุเพียงเพราะ offline |
| Refresh ล้มเหลว (401/invalid_grant) | ลบ token → `SESSION_EXPIRED` → แสดงแถบ "เข้าสู่ระบบอีกครั้ง" ใน ฉัน เท่านั้น; ไม่มี popup; เอกสารไม่กระทบ |
| Network/5xx | คง session; retry backoff; ไม่ลบ token |

State machine (อยู่ใน AuthService; UI subscribe อย่างเดียว)
```
LOCAL ──login/register──▶ AUTHENTICATING ──ok──▶ AUTHENTICATED
  ▲                          │fail                     │ token ใกล้หมด
  │                          ▼                         ▼
  │                        LOCAL               TOKEN_REFRESHING ──ok──▶ AUTHENTICATED
  │                                                │network fail          │offline
  │                                                ▼                      ▼
  │                                     OFFLINE_AUTHENTICATED ◀───────────┘
  │                                                │ refresh rejected
  └──────logout / revoke / delete──── SESSION_EXPIRED
```

## 6. Data ownership model

- **เอกสารทุกฉบับเป็นของ installation นี้ (local owner)** ไม่ว่าจะ login หรือไม่ — ownership ไม่ผูกกับบัญชีใน 1.3
- Login/Logout/Token expiry/Password reset/Backend down → **ไม่แตะตาราง documents และไฟล์เลย** (ไม่มี write ใด ๆ)
- ไม่มี duplicate: login ไม่คัดลอก ไม่ย้าย ไม่ re-encrypt เอกสาร
- โมเดลอนาคต (เมื่อเปิด Backup — ไม่ใช่ 1.3): เพิ่ม `documents.account_user_id NULL` + `origin_installation_id` ด้วย migration แยกที่ผ่าน review; เอกสารจะถูกผูกกับบัญชี **เฉพาะเมื่อผู้ใช้เลือกสำรองฉบับนั้น** และ `sync_state` เดิมใช้ต่อ (`local_only` → `pending_upload` → `synced`)
- เหตุผลที่เลื่อนคอลัมน์ไป: ค่าที่ไม่มีใครใช้ใน 1.3 สร้างคำถาม logout/ลบบัญชี/หลายคนใช้เครื่องเดียว โดยไม่มีประโยชน์ — `workspace_id` และ `sync_state` มีอยู่แล้วรองรับอนาคต
- เครื่องเดียวหลายบัญชี: เอกสาร local ไม่แยกตามบัญชี (เหมือน 1.2) — ระบุชัดใน UI การ Backup ในอนาคตว่าเลือกเอกสารที่จะสำรองเอง

## 7. Logout behavior

| ทำ | ไม่ทำ |
| --- | --- |
| revoke session ที่ provider + revoke device ที่ API (best effort; offline ก็ logout ได้) | ลบเอกสาร, โฟลเดอร์, OCR, search index |
| ลบ refresh token + account cache (`app_meta.account_link`, entitlement cache) | เปลี่ยน encryption key / data key / SQLCipher key |
| state → `LOCAL`; หน้า ฉัน กลับเป็น Account Entry | ล้าง installation_id (ใช้ต่อเพื่อผูก device เมื่อ login ใหม่) |
| audit `LOGOUT` (ฝั่ง server เมื่อถึง) | popup เตือนเรื่องเอกสาร (เพราะไม่มีอะไรหาย) |

"ออกจากระบบและลบข้อมูลออกจากเครื่อง" = **action แยก** (ไม่อยู่ใน 1.3 เว้นแต่ Owner สั่ง) ต้องพิมพ์ยืนยัน และแสดงจำนวนเอกสารที่จะถูกลบ

## 8. Account deletion behavior

- ทางเข้า: ฉัน → บัญชี OneScan → ลบบัญชี (+ หน้าเว็บสำหรับ Play policy)
- ขั้นตอน: ยืนยันรหัสผ่าน (re-auth) → หน้าอธิบาย 2 ข้อแยกกันชัด:
  1. **ลบบัญชี** = ลบข้อมูลบนเซิร์ฟเวอร์ (บัญชี อุปกรณ์ สิทธิ์) และออกจากระบบทุกเครื่อง
  2. **เอกสารบนเครื่องนี้จะยังอยู่** — ถ้าต้องการลบให้ใช้ "ลบเอกสาร" แยก
  → ปุ่ม "ลบบัญชี" สีแดง + checkbox "ฉันเข้าใจ"
- Server lifecycle: `status=pending_deletion`, revoke ทุก session ทันที, grace 14 วัน (login ใหม่ = ถามว่าจะยกเลิกการลบไหม) → hard delete `users`/`devices`/`entitlements`/provider user; `audit_events` ของผู้ใช้ถูก pseudonymise (user_id → hash) และเก็บ 12 เดือนแล้วลบ
- เมล "ได้รับคำขอลบบัญชี" และ "ลบเสร็จแล้ว"; email ว่างให้สมัครใหม่หลังลบเสร็จ
- ไม่ลบเอกสาร local โดยนัย ไม่ว่ากรณีใด

## 9. Upgrade / migration plan จาก 1.2.x

| ข้อ | แผน |
| --- | --- |
| Schema | v3: `CREATE TABLE IF NOT EXISTS app_meta` อย่างเดียว — additive, idempotent, อยู่ใน transaction เดียวกับ `user_version` ตามกลไก migration เดิม (resume ได้หลัง force stop) |
| installation_id | สร้าง lazily ครั้งแรกที่ต้องใช้ (`INSERT OR IGNORE`) — ไม่ทำงานตอน startup path |
| เอกสาร | ไม่ถูกแตะ → ไม่มี duplicate, FTS5 ไม่ rebuild, key ไม่เปลี่ยน |
| Login | ไม่บังคับ; ไม่มี popup; Onboarding ไม่ถูกแสดงซ้ำ |
| Feature flag | `account_enabled` ใน production gate (ปิดได้จาก remote config) — ปิดแล้ว UI บัญชีหายไป แอปเหมือน 1.2 |
| ทดสอบ | ติดตั้ง 1.3 ทับ 1.2.0 (upload key เดียวกัน) พร้อมเอกสาร 20 หน้า/OCR/โฟลเดอร์; force stop ระหว่าง migration; downgrade ไม่รองรับ (ระบุใน release notes) |

## 10. Threat model (STRIDE)

| ภัย | ตัวอย่าง | การป้องกัน |
| --- | --- | --- |
| Spoofing | credential stuffing, brute force | rate limit ต่อ IP+email, CAPTCHA หลังล้มเหลว N ครั้ง, password ขั้นต่ำ 8 ตัว + ตรวจรหัสที่รั่ว (HIBP ที่ provider), ข้อความ error ไม่บอกว่ามี email นี้หรือไม่ |
| Spoofing | ขโมย refresh token จากเครื่อง | SecureStore (Keystore), rotation + reuse detection, revoke รายเครื่อง |
| Tampering | แก้ entitlement ในเครื่อง | server เป็น source of truth; cache ในเครื่องใช้แสดงผลเท่านั้น; core capabilities ไม่ขึ้นกับ entitlement |
| Repudiation | ปฏิเสธว่าไม่ได้ลบบัญชี | audit events §11 |
| Information disclosure | log มี token/เนื้อหา | allowlist fields ใน audit/analytics, test ตรวจ log; ไม่มี endpoint ใดรับเนื้อหาเอกสาร |
| Information disclosure | email enumeration ที่ register/forgot | ตอบแบบเดียวกันทุกกรณี |
| Information disclosure | App Link ถูกแอปอื่นดัก | Android App Links (verified domain, `autoVerify`), token ใช้ครั้งเดียว อายุสั้น |
| DoS | ยิงส่งอีเมล/OTP | cooldown 60 วิ + limit ต่อชั่วโมง/วันต่อ email และ IP |
| DoS ต่อ scanner | backend ล่มแล้วแอปค้าง | ไม่มี network call ใน startup/scan path, timeout 10 วิ, circuit breaker ใน AuthService |
| Elevation | ใช้ JWT ของคนอื่นเรียก `/devices/{id}/revoke` | ตรวจ `device.user_id == jwt.user_id` ทุก endpoint |
| เครื่องหาย | คนเก็บได้เปิดเอกสาร | เหมือน 1.2 (เอกสารอยู่ในเครื่อง; screen lock ของระบบ); ผู้ใช้ revoke เครื่องจากอีกเครื่องได้ — ไม่ทำให้เอกสาร local หาย (ระบุใน FAQ) |

## 11. Audit events

`REGISTER · EMAIL_VERIFIED · LOGIN_SUCCESS · LOGIN_FAILED · TOKEN_REFRESH (sampled/aggregated) · PASSWORD_RESET_REQUEST · PASSWORD_RESET_COMPLETED · LOGOUT · LOGOUT_ALL · DEVICE_REGISTERED · DEVICE_REVOKED · ACCOUNT_DELETE_REQUESTED · ACCOUNT_DELETED`
- ต้นทาง: provider auth hooks/webhooks + OneScan API
- ห้ามบันทึก: password, OTP, access/refresh token, เนื้อหาเอกสาร, OCR text, IP ดิบ
- เก็บ 12 เดือน

## 12. Account UI flow

```
ฉัน (ไม่ได้ login)
 ┌ OneScan Account ──────────────────────────┐
 │ สำรองและเข้าถึงเอกสารของคุณบนอุปกรณ์อื่นในอนาคต │
 │ [ สร้างบัญชี ]   เข้าสู่ระบบ                   │
 └───────────────────────────────────────────┘
 ทั่วไป · ข้อมูล · เกี่ยวกับ (เหมือน 1.2)

สร้างบัญชี: อีเมล · รหัสผ่าน · ยืนยันรหัสผ่าน · Terms/Privacy → [สร้างบัญชี]
   → ยืนยันอีเมลของคุณ (แสดงอีเมล) · เปิดแอปอีเมล · ส่งอีกครั้ง (นับถอยหลัง 60 วิ) · เปลี่ยนอีเมล
   → แตะลิงก์ในอีเมล → เปิดแอป → "ยืนยันแล้ว" → ฉัน (logged in)
เข้าสู่ระบบ: อีเมล · รหัสผ่าน → [เข้าสู่ระบบ] · ลืมรหัสผ่าน · สร้างบัญชี
ลืมรหัสผ่าน: อีเมล → ส่งลิงก์ → (ลิงก์) ตั้งรหัสใหม่ → เข้าสู่ระบบ

ฉัน (login แล้ว)
 OneScan Account: email · สถานะ (ยืนยันแล้ว / รอยืนยัน) · แผน FREE
 อุปกรณ์ของฉัน → รายการ (รุ่น · ใช้งานล่าสุด) · ออกจากระบบอุปกรณ์นี้ · ออกจากระบบทุกอุปกรณ์
 ความเป็นส่วนตัว · ความปลอดภัย (เปลี่ยนรหัสผ่าน, ลบบัญชี) · ภาษา · ภาษา OCR · เกี่ยวกับ OneScan
 [ออกจากระบบ]

สถานะพิเศษ: SESSION_EXPIRED → แถบ "เซสชันหมดอายุ · เข้าสู่ระบบอีกครั้ง" ใน ฉัน
            Backend ล่ม → "บริการบัญชีไม่พร้อมใช้งานชั่วคราว" ในหน้า Account เท่านั้น
```
ไม่มี popup ตอนเปิดแอป, ไม่มีการเตือนให้สมัครใน Home/กล้อง/Review; ทุกหน้าใช้ design system V2 และรองรับ TH/EN, Dark, ตัวอักษรใหญ่

## 13. สิ่งที่ต้องเปลี่ยนใน OneScan codebase

| ส่วน | การเปลี่ยน |
| --- | --- |
| `src/core/database/migrations.ts` | v3 `app_meta` (additive) |
| `src/core/identity/` (ใหม่) | `installationId()` |
| `src/services/auth/` (ใหม่) | `AuthService` (state machine), `AuthProvider` adapter (Supabase), `SessionStore` (SecureStore) |
| `src/core/entitlements/` (ใหม่) | `capabilities()`, `can(capability)`; FREE default offline |
| `src/core/networking/apiClient.ts` | timeout 10 วิ, auth header, refresh-once-on-401, แยก error ประเภท network/auth/server |
| `src/core/config/remoteConfig.ts` | flag `account_enabled` + production gate |
| `src/features/profile/ProfileScreen.tsx` | การ์ด Account Entry / Logged-in |
| `src/features/account/` (ใหม่) | Register, Login, Verify, Forgot/Reset, Devices, Delete account |
| `src/app/` routes + Android App Links | `/auth/verify`, `/auth/reset` (intent filter `autoVerify` + `assetlinks.json` บนโดเมน) |
| i18n en/th | `account.*` |
| analytics | events แบบไม่มี PII (`account_register_started` ฯลฯ) |
| Backend repo ใหม่ (`onescan-api`) | Workers + migrations Postgres + tests |
| Store listing | Data safety form (email, device info), ลิงก์ลบบัญชีบนเว็บ |

## 14. สิ่งที่ไม่ต้องเปลี่ยน

CameraX/Camera pipeline · DocSeg · Presence Gate · Crop ML · Candidate Generation · Ranker · Confidence Gate · Auto Apply ·
OCR Engine · PDF Engine · AES-256-GCM / Android Keystore (`onescan.kek.v1`) / data key · SQLCipher key · Search/FTS5 ·
ตาราง documents/pages/folders/document_fts · migrations v1–v2 · SyncEngine (stub คงเดิม) · Home/Documents/Tools/Viewer/Review UI · Onboarding

## 15. Implementation phases (หลัง Owner approve)

| ขั้น | งาน | ออกเมื่อ |
| --- | --- | --- |
| 1–4 | เอกสารนี้ + threat model + provider + DB/API spec | **รอ Owner review (ตอนนี้)** |
| 5–6 | Account UX prototype (เพิ่มหน้า Account ใน prototype V2 เดิม ไม่ redesign) → Owner review | approve |
| 7 | Backend: Supabase project dev/prod, schema, Workers API, rate limit, audit, SMTP, App Links domain | integration tests ผ่าน |
| 8 | Mobile: identity + AuthService + SessionStore + entitlements + apiClient (flag ปิด) | unit tests ผ่าน |
| 9 | Account UI ตาม prototype | screenshot TH/EN/Dark |
| 10 | Migration v3 + upgrade tests จาก 1.2.0 | ผ่าน |
| 11 | Automated: state machine, offline/backend-down (scanner ต้องใช้ได้), token expiry, log redaction | ผ่าน |
| 12 | Real-device QA ตาม test matrix Phase 19 | ไม่มี P0 |
| 13 | Security review (checklist OWASP MASVS-AUTH/STORAGE/NETWORK) | ผ่าน |
| 14–15 | RC → Production (versionCode > 13) | Owner |

## 16. Risks

| ความเสี่ยง | ผล | การลด |
| --- | --- | --- |
| Backend ทำให้ startup ช้า/ค้าง | scanner outage | ไม่มี network ใน startup; test "API ล่ม" อัตโนมัติ |
| อีเมลยืนยันไม่ถึง/เข้า spam | สมัครไม่สำเร็จ | SMTP ที่มี SPF/DKIM/DMARC, ส่งอีกครั้ง, เปลี่ยนอีเมล |
| ผู้ใช้เข้าใจว่า login = สำรองข้อมูล | เข้าใจผิดว่าเอกสารปลอดภัยบนคลาวด์ | ข้อความ "ในอนาคต" ชัดเจน; ไม่มีคำว่า Backup ทำงานใน 1.3 |
| ผู้ใช้เข้าใจว่าลบบัญชี = ลบเอกสาร (หรือกลับกัน) | ข้อมูลหาย/ค้าง | สองข้อความแยกในหน้าลบ (§8) |
| Vendor lock-in / ราคาเปลี่ยน | ย้ายยาก | user_id ของเรา + auth_identities, Postgres มาตรฐาน |
| Play policy (ลบบัญชี, Data safety) | ถูก reject | หน้าลบบัญชีบนเว็บ + Data safety ก่อน RC |
| PDPA (ข้อมูลส่วนบุคคล: email, device) | กฎหมาย | Privacy policy ใหม่, data minimisation, region SG, retention §8/§11 |
| เพิ่มขนาด/ความซับซ้อนแอป | bug ใน core | Identity แยก module, flag ปิดได้, ไม่ import จาก Local Mode |
| ต้องมีโดเมน/อีเมล/บัญชี cloud | blocked | Owner จัดหาก่อนขั้น 7 |

## การตัดสินใจที่ต้องการจาก Owner

1. Provider: Supabase Auth (แนะนำ) หรือ ทางเลือกสร้างเองด้วย Better Auth
2. โดเมนสำหรับ App Links/Terms/Privacy/ลบบัญชี (เช่น `onescan.app`) และผู้ให้บริการส่งอีเมล
3. อายุ token: access 15 นาที, refresh 30 วัน inactivity / 90 วันสูงสุด — ยอมรับหรือไม่
4. Grace period การลบบัญชี 14 วัน — ยอมรับหรือไม่
5. ยืนยัน: ไม่เพิ่มคอลัมน์ ownership ใน documents จนกว่าจะทำ Backup (§6)
6. ต้องยืนยันอีเมลก่อนใช้บัญชีหรือไม่ (แนะนำ: ต้องยืนยันก่อน login ได้ — ใน 1.3 บัญชียังไม่มีบริการใดที่ต้องรีบใช้)
