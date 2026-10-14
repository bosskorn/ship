# OneScan 1.3 Account — การตั้งค่าเซิร์ฟเวอร์ก่อน QA บนเครื่องจริง

ระบบบัญชีต้องมีบริการ 2 ตัวที่อยู่ในบัญชีของ Owner (ผมสร้างบัญชี cloud แทนไม่ได้):
1. **Supabase** — ยืนยันตัวตน (สมัคร, ยืนยันอีเมล, เข้าสู่ระบบ, รีเซ็ตรหัสผ่าน, session) + ฐานข้อมูล
2. **Cloudflare Workers** — OneScan API (บัญชี, อุปกรณ์, ลบบัญชี, หน้าลิงก์อีเมล, Terms/Privacy)

ใช้เวลาประมาณ 30–45 นาที ทำครั้งเดียว แยก project สำหรับ QA และ Production

## 1. Supabase
1. สร้าง project ใหม่ที่ supabase.com → Region **Southeast Asia (Singapore)** → ตั้งชื่อ `onescan-qa`
2. Project Settings → API: จด **Project URL**, **anon public key**, **service_role key** (service_role ห้ามใส่ในแอป/ห้ามส่งในแชท)
3. Database → Extensions: เปิด **pg_cron** (ใช้ตัด session ตามนโยบาย 30/90 วัน และลบบัญชีครบ 14 วัน)
4. รัน migration: SQL Editor → วางไฟล์ `backend/supabase/migrations/20261014000000_account_foundation.sql` → Run
   (หรือ `supabase link --project-ref <ref>` แล้ว `supabase db push`)
5. Settings → Data API → **Exposed schemas**: เพิ่ม `app` (ปลอดภัย: role ฝั่งแอปไม่มีสิทธิ์ใน schema นี้)
6. Authentication → ตั้งค่าให้ตรง `backend/supabase/config.toml`:
   - Email: **Confirm email = ON**, Secure password change = ON, Minimum password length **8**, Password requirements **letters and digits**
   - Sessions/JWT: Access token expiry **900** วินาที, Refresh token rotation **ON**, Reuse interval **10** วินาที
   - (Pro) Time-box user sessions **90 วัน**, Inactivity timeout **30 วัน** — แผนฟรีมี pg_cron ทำแทนอยู่แล้ว
   - Rate limits: ตาม `[auth.rate_limit]` ใน config.toml
   - URL Configuration: **Site URL** = `https://<worker>/auth/link` และเพิ่ม Redirect URL เดียวกัน (ได้จากข้อ 2.4)
   - Email Templates: **Confirm signup** และ **Reset password** → คัดลอกจาก `backend/supabase/templates/confirmation.html` และ `recovery.html`
   - SMTP: ใส่ผู้ให้บริการส่งอีเมล (Resend / Amazon SES) — SMTP ในตัวของ Supabase ส่งได้น้อยมาก ใช้ทดสอบได้แค่ไม่กี่ฉบับต่อชั่วโมง

## 2. Cloudflare Worker (OneScan API)
1. `cd onescan/backend/api && npm install`
2. `npx wrangler login`
3. แก้ `wrangler.toml`: `SUPABASE_URL = "https://<ref>.supabase.co"`
4. `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (วาง service_role key)
5. `npx wrangler deploy` → ได้ URL เช่น `https://onescan-api.<account>.workers.dev`
6. ตรวจ: เปิด `https://onescan-api.<account>.workers.dev/v1/health` ต้องได้ `{"ok":true}`
7. กลับไปตั้ง Site URL/Redirect URL ของ Supabase (ข้อ 1.6) เป็น `<worker URL>/auth/link`

## 2b. ทางเลือก: OneScan API บน Supabase Edge Functions (ใช้กับ QA ชุดปัจจุบัน)

ใช้แทน Cloudflare Worker ได้โดยไม่ต้องมี secret ใด ๆ — function ต่อฐานข้อมูลด้วย `SUPABASE_DB_URL` ที่ Supabase ใส่ให้เอง
(ไม่ใช้ service-role key, schema `app` ไม่ต้องเปิดผ่าน REST API)

- Source: `backend/supabase/functions/onescan-api/index.ts` (ใช้ route/กฎเดียวกับ `backend/api`)
- Build: `cd backend/api && npm ci && cd ../.. && node backend/supabase/functions/build.mjs` → `functions/onescan-api/dist/index.js`
- Deploy: ชื่อ `onescan-api`, **verify_jwt = false** (API ตรวจ access token เอง และ `/auth/link`, `/legal/*` ต้องเปิดสาธารณะ)
- URL ของ API = `https://<project>.supabase.co/functions/v1/onescan-api`
- ข้อจำกัดของ host นี้: Supabase ไม่เสิร์ฟ HTML จาก function → `/auth/link` ตอบ 302 ไป `onescan://auth/callback`
  (fragment ที่มี token ถูกเบราว์เซอร์พาไปเอง ไม่ถึง server) และหน้า Terms/Privacy เป็นข้อความธรรมดา; rate limit นับต่อ instance
- อีเมลแม่แบบเริ่มต้นของ Supabase ส่งลิงก์ `/auth/v1/verify` ซึ่ง redirect กลับมาพร้อม session ใน fragment —
  แอปรองรับทั้งแบบนี้ (`parseSessionLink`, ตรวจ token กับ Supabase `/user` ก่อนใช้ และ login อัตโนมัติเฉพาะอีเมลที่เครื่องนี้รอยืนยันอยู่)
  และแบบ `token_hash` ของแม่แบบใน `backend/supabase/templates`

ตั้งค่าใน Dashboard (ทำผ่าน MCP ไม่ได้):
1. Authentication → URL Configuration → **Redirect URLs** เพิ่ม `https://<project>.supabase.co/functions/v1/onescan-api/auth/link`
   (และตั้ง Site URL เป็นค่าเดียวกันได้)
2. SMTP เริ่มต้นของ Supabase ส่งอีเมลได้เฉพาะสมาชิกทีมของ Organization — ผู้ทดสอบต้องอยู่ใน Team หรือตั้ง Custom SMTP
3. แนะนำ: Access token expiry = 900 วินาที, Minimum password length = 8

## 3. ส่งค่าให้ build แอป QA
ส่งให้ผม 3 ค่า (ทั้งหมดเป็นค่าสาธารณะที่อยู่ในแอปอยู่แล้ว ไม่ใช่ความลับ):
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
EXPO_PUBLIC_ACCOUNT_API_URL=https://onescan-api.<account>.workers.dev
```
**ห้ามส่ง service_role key, รหัสผ่าน หรือ keystore**
ผมจะ build `OneScan-v1.3.0-QA1` (versionName 1.3.0, versionCode 14, upload key) พร้อม checklist `QA-CHECKLIST-1.3-ACCOUNT.md`

ถ้าไม่ได้ใส่ 3 ค่านี้ แอปจะทำงานเหมือน 1.2 ทุกอย่าง (ไม่มีส่วนบัญชี) — นี่คือ safe default
ปิดระบบบัญชีชั่วคราวได้จาก remote config flag `account_enabled = false` โดยไม่กระทบการสแกน/เอกสาร

## 4. ก่อน Production 1.3.0 (ไม่ใช่รอบ QA นี้)
- โดเมนจริง + Android App Links (Security Review M1)
- Terms/Privacy ผ่านการตรวจ + หน้าเว็บลบบัญชี + Google Play Data safety (M2)
- Supabase project แยกสำหรับ Production

## 5. Android App Links (M1, required for production)

ต้องมีโดเมนจริงของ OneScan (เช่น `links.<โดเมน>`) ที่ชี้ไปยังเซิร์ฟเวอร์ซึ่งเสิร์ฟ 2 path:
`/.well-known/assetlinks.json` (JSON, 200, ไม่มี redirect) และ `/auth/link` (หน้าแจ้งให้เปิดบนมือถือ)
— Cloudflare Worker ใน `backend/api` ทำทั้งสองอย่างแล้ว (ตั้ง `ANDROID_CERT_SHA256` = upload key + Play app-signing key)

1. Build แอปด้วย `EXPO_PUBLIC_APP_LINK_HOST=<host>` → `app.config.js` เพิ่ม intent filter `android:autoVerify="true"` สำหรับ `https://<host>/auth/link`
   (ต้อง `npx expo prebuild --platform android` ใหม่เพื่อให้ AndroidManifest ได้ intent filter นี้)
2. Supabase → Authentication → URL Configuration: Site URL และ Redirect URLs = `https://<host>/auth/link`
   (ลบ redirect แบบ `onescan://` และ URL ของ QA ออกจากโปรเจกต์ production)
3. ตรวจ: `node scripts/verify-app-links.mjs <host> --apk <apk> --cert <upload SHA-256> --cert <Play signing SHA-256>`
4. บนเครื่อง: `adb shell pm get-app-links app.onescan.mobile` ต้องเห็น `<host>: verified`
   และ `adb shell am start -a android.intent.action.VIEW -d "https://<host>/auth/link#token_hash=test&type=email"` ต้องเปิด OneScan

เมื่อตั้ง host แล้ว แอปไม่รับลิงก์อีเมลแบบ `onescan://` อีก (ทิ้งทั้งใน native intent และหน้า callback)
