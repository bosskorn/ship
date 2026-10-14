# OneScan 1.2.0 — Production Release (READY, รอ Owner อนุมัติก่อนอัปโหลด)

| รายการ | ค่า |
| --- | --- |
| AAB | `OneScan-v1.2.0-Production.aab` |
| SHA-256 | `3ceb3a3364a01b2e30a883a6a5402bb3c8a510d8ddc7ac7aa37bec95f5391b81` |
| ขนาด | 81,878,262 bytes (78.1 MiB) |
| Application ID | `app.onescan.mobile` |
| versionName / versionCode | 1.2.0 / **13** |
| minSdk / targetSdk | 24 / 36 |
| ABI | arm64-v8a, armeabi-v7a |
| Git commit | `78c0121` (branch `claude/release-1.2.0`) = RC4 source `b2a175b` + versionCode 13 เท่านั้น |
| Build timestamp | 2026-10-14 09:53:27 UTC |
| Signing | Upload key `CN=OneScan Upload, O=OneScan` · cert SHA-256 `1c10565d4eea9633235b788ce00bf3ef72b78461899dd929691fafc0f0e960a8` (เดียวกับ RC1–RC4) |
| R8 mapping (สำหรับ Play Console → deobfuscation) | `OneScan-v1.2.0-Production-mapping.txt.gz` · SHA-256 `0d53cca689cf77534d57f53a7cd2b86c06e73ec8e4d4435604d892288b359f62` |
| Tested artifact | `OneScan-v1.2.0-RC4-arm64.apk` (SHA-256 `9d1640b3…ab19100`) — คงไว้ ไม่ overwrite |

## ความเหมือน RC4 (ตรวจแบบ byte-level)
- JS bundle `index.android.bundle` SHA-256 `ef136b1b…3b50d4` = RC4 เหมือนกันทุก byte
- โมเดล `docseg.bin` SHA-256 `a010c14d…edc83f3` = RC4
- Permissions = RC4: CAMERA, INTERNET, ACCESS_NETWORK_STATE, VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT, READ/WRITE_EXTERNAL_STORAGE (maxSdk 32), DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION

## Automated tests (บน commit 78c0121)
| ตรวจ | ผล |
| --- | --- |
| TypeScript (`tsc --noEmit`) | ผ่าน |
| Jest | 168/168 ผ่าน (17 suites) |
| Native (`:onescan-vision:testDebugUnitTest`, rerun) | 20/20 ผ่าน |
| i18n hard-coded scan | 0 |
| ESLint | **1 error, 4 warnings** — error: `DocumentViewerScreen.tsx:35` `react-hooks/refs` (อ่าน `useRef().current` ระหว่าง render เพื่อให้ callback ของ FlatList คงที่) เป็นกฎ lint ไม่ใช่ runtime bug; Viewer ผ่าน Owner smoke test; ไม่แก้เพื่อคง source = RC4 → BACKLOG 1.2.1 · warnings 4 ข้อเดิม (docSeg) |
| Release compile + R8 | ผ่าน (minify on, mapping.txt สร้างแล้ว) |

## Production flag / config verification
- Release build, ไม่ debuggable, ไม่มี debug signing
- Production gate ปิด: AI, credits, cloud backup, external cloud, Pro/plans, advanced PDF, convert, app lock, redaction, auto capture, glare/shadow/restore, Trash, devTools (Scan Diagnostics), telemetry settings
- Auto Apply Crop = **OFF** (`autoThreshold 1.01`) — ครอปถูกเสนอให้ตรวจ ไม่ apply เอง
- OCR "English only" (`latin`) = preview → ซ่อนใน release; เหลือ อัตโนมัติ / ไทย+อังกฤษ
- Pseudo-locale en-XA = preview → ซ่อนใน release
- Account / Login = ไม่มีในโค้ด 1.2.0 (branch `claude/account-1.3` แยก ไม่ merge)
- ไม่มี Ads / Subscription / test data
- Backend: ไม่ได้ตั้ง `EXPO_PUBLIC_API_BASE_URL` → `apiClient` ไม่เรียก network; remote config ใช้ค่า fallback ในเครื่อง; Scanner/OCR/PDF/Search ไม่พึ่ง Internet

## Security verification (ไม่เปลี่ยนจาก RC4)
- เอกสาร: AES-256-GCM, data key ห่อด้วย Android Keystore (`onescan.kek.v1`)
- DB: SQLCipher, key จาก data key เดียวกัน
- Local-first, ไม่อัปโหลดอัตโนมัติ
- `allowBackup=false`, `fullBackupContent=false`, `dataExtractionRules` เดิม
- Release signing config เดิม (upload key นอก repo); ไม่มี keystore/password ใน repo
- ไม่เปลี่ยน encryption key, migration (schema v2), FTS5, CameraX, ML, OCR, PDF

## versionCode
build ที่รู้จักทั้งหมด: RC1 = 11, RC2–RC4 = 12, Production = 13 (สูงสุด) — Owner โปรดยืนยันใน Play Console ว่าไม่เคยอัปโหลด versionCode ≥ 13

## Release notes
ดู `RELEASE-NOTES-1.2.0.md` (TH 460 / EN 472 ตัวอักษร, ไม่เกิน 500 ของ Play)

## Backlog 1.2.1
ดู `BACKLOG-1.2.1.md` (+ ESLint `react-hooks/refs` ใน Viewer)

**ยังไม่ได้อัปโหลด/เผยแพร่ขึ้น Google Play — รอ Owner อนุมัติขั้นสุดท้าย**
