# OneScan Current Application Status — READY FOR OWNER DECISION

**Audit type:** read-only. I changed no code and ran no builds, tests or benchmarks. Problems found are
reported, not fixed.

**Date:** 2026-10-15.

**Method:**
- `git` branch and commit graph.
- Source code read by three read-only audit passes: flows, account/cloud, and the earlier skill
  fact sheets.
- Release, QA and preview records on branch `apk-builds`.
- Recorded test results from the work history. Every test result below is labelled with the commit
  it applies to.

## 0. Baseline facts

| Item | Value |
|---|---|
| Current branch / HEAD | `claude/agent-skills-baseline` @ `ec13c1c` (working tree clean before this report) |
| App code at HEAD | Identical to `f744530`, the end of Document Tools Phase B. Since then only tooling, R&D and docs changed. The only `src/` additions are the R&D harness `src/__rr__` (not part of the app or of `npm test`) |
| **Release baseline** | **1.2.0 Production AAB**: versionName 1.2.0, versionCode **13**, commit `78c0121` (branch `claude/release-1.2.0`, = RC4 `b2a175b` + versionCode only). Built and signed with the upload key, R8 mapping included. **Not uploaded to Google Play** (`apk-builds:RELEASE-1.2.0.md`) |
| `main` | `0a80b98` (2025, unrelated upload). OneScan is not on `main`; branches are the real history |
| app.json at HEAD | version **1.2.0**, versionCode **12**, iOS buildNumber 6. The 13 lives only on the release branch |
| Expo / RN | Expo SDK 57 (`expo ~57.0.27`), React Native 0.86.3, React 19.2.3, Expo Router 57 |
| Android | package `app.onescan.mobile`; minSdk 24, target 36; ABIs arm64-v8a + armeabi-v7a; R8 + resource shrink in release; backup off; RECORD_AUDIO and SYSTEM_ALERT_WINDOW blocked; CNG (`android/` is generated and gitignored; the copy on disk is stale) |
| Latest status docs | `ONESCAN-AGENT-SKILLS-BASELINE.md`, `ONESCAN-INTERNAL-SKILLS.md`, `tools/receipt_restore/ONESCAN-RECEIPT-RESTORE-R2.md`, `tools/receipt_restore/enhance_validation/REAL-RECEIPT-VALIDATION.md`, `docs/account/*.md`, `apk-builds:{RELEASE-1.2.0, QA-RESULTS-RC4, SMOKE-RC4, BACKLOG-1.2.1, ACCOUNT-PREVIEW-1.3, DOC-TOOLS-A/B-PREVIEW}.md` |

There are **two product lines**:
- **1.2.0**: the frozen release candidate. No account; Document Tools are not included.
- **1.3 line** (HEAD): 1.2.0 plus 142 changed files and about 13.9k added lines. It adds:
  - Account Foundation
  - the V3 UI
  - Document Tools Phase A and Phase B
  - unique scan names
  - App Links code

  It has never had a QA build, and it has no recorded device QA.

## 1. Product status

Prototypes, R&D and test harnesses are excluded from every bucket except R&D/PARKED.

| Status | Items |
|---|---|
| **PRODUCTION READY** | **None in the strict sense.** The 1.2.0 AAB is built and passes automated gates, but its real-device QA results are **not recorded** (the RC4 results sheet is blank) and it has not been submitted to Play |
| **IMPLEMENTED + TESTED** (host, automated) | 1.2.0 scope: <br>• scan (OneScan camera + Google scanner fallback) <br>• crop review/manual <br>• filters <br>• Thai+English OCR <br>• save with encryption <br>• documents/folders <br>• viewer <br>• search (FTS) <br>• share PDF / print <br>• import image/PDF <br>• TH/EN UI <br>• onboarding/permissions <br>• settings <br>• privacy hardening <br>• 20-page cap <br>• low-disk guards <br>(jest 168/168, native 20/20 @ `78c0121`) |
| **IMPLEMENTED BUT NEEDS REAL DEVICE QA** | • Everything in 1.2.0 (sheet blank). <br>• 1.3 line: <br>&nbsp;&nbsp;– V3 UI <br>&nbsp;&nbsp;– Document Tools A (favourites, tags, info, filters, print without plaintext) <br>&nbsp;&nbsp;– Document Tools B (Page Manager, Images→PDF, PDF→Images, Merge, Split, cancel/undo) <br>&nbsp;&nbsp;– unique scan names <br>&nbsp;&nbsp;– account app layer <br>&nbsp;&nbsp;(jest 358/358 @ `f744530`; the preview docs state "not yet tested on a real device or emulator") <br>• OCR temp fix `d1cbb22` (separate branch) |
| **IN PROGRESS** | None active. Feature development is PAUSED by the Owner |
| **BLOCKED** (needs the Owner) | • Account E2E: needs the Supabase "Allow" for the database part (sign-out/devices/delete), the dashboard Redirect URL, real emails, and 2 devices. <br>• HTTPS App Links (M1): needs a domain, a Worker deploy and the Play signing SHA-256. <br>• M2: legal review, deletion web page, Play Data safety. <br>• Receipt Enhance: waiting for 30 real receipts. <br>• Real-device QA of everything: this container has no device or KVM |
| **BACKLOG** | • 1.2.1 backlog: share-PDF plaintext lifetime, orphan files after a failed `saveEdits`, the "Duplicate" message at 20 pages, ESLint Viewer (fixed later in the 1.3 line, `3eb347f`). <br>• DocSeg Receipt Crop. <br>• Trash, app lock, redaction (creating redacted copies), auto-capture, cloud backup, AI, Pro/pricing: present as hidden stubs or partial code, release-off. <br>• Automated QA task #19 (lighting A–E) |
| **PARKED** | Receipt Flatten |
| **NOT APPROVED** | Receipt R3, Custom Dewarp model |
| R&D only (not product) | Receipt Restore R1/R2 (FROZEN), Receipt Enhance validation tooling `373962d` (FROZEN BEFORE REAL DATA), the `src/__rr__` harness, the screenshot harness |

## 2. Screens / user flows (source at HEAD = 1.3 line; differences from 1.2.0 noted)

| Flow | Exists | Works how far | Tested (host) | Missing / notes |
|---|---|---|---|---|
| Launch / onboarding / permissions | yes | Guarded stack; startup cleanup; legacy encryption migration in the background; camera permission only | v3Bugfix, accountIsolation, productionGuards, v13MeToolsNaming | – |
| Scan (engine choice) | yes | OneScan CameraX by default; Google ML Kit scanner fallback after 2 failures in 7 days; expo-camera as last resort | scannerPhase1 | auto-capture is release-off |
| Camera capture | yes | Manual capture, live edges, quality coach, multipage (max 20), ID and receipt modes | scannerPhase1, autoCapture, quadDetector, imageQuality | real optics: device only |
| Auto crop | yes | DocSeg + ranker; **auto-apply OFF** (`autoThreshold` 1.01); review (≥0.65) or manual editor | autoCrop, docSeg, quadDetector, presence | precision 95% < 98% target |
| Manual crop / edit | yes | Crop / Adjust / Rotate / Delete / Add page, via `reprocess` | v3Screens, v3Bugfix | – |
| Enhancement / filters | yes | original, auto (scan look), card, document, color, gray, bw | imageQuality, documentEngine, Kotlin PageProcessor/ColourInk | – |
| OCR | yes | On save, per page, on device; Tesseract tha+eng / ML Kit Latin; 60 s per page; best effort (save never fails on OCR); stored in the DB + FTS; Text screen with Copy | search, searchSnippet, pageToolsEngine | no dedicated OCR engine test; none without the native module (iOS / web) |
| Save | yes | Pages → PDF → thumbnail → OCR → PII flags → DB transaction; encrypted; cancel + cleanup; unique names | pageToolsEngine, scanNameCollision, documentEngine | – |
| Document list / folders / tags / favourites | yes | Rename, favourite, tags, move, share, print, duplicate, delete, multi-select | documentToolsA/UI, v3Bugfix | **No Trash**: delete is permanent (with confirmation) |
| Viewer | yes | Zoom, Share, Edit, Text, More (Page Manager / split / to-images, sensitive review) | v3Screens | imported PDFs cannot be edited |
| Search | yes | SQLite FTS5 (unicode61, diacritics removed, prefix) over title + OCR text; filters | search, searchSnippet, documentToolsA | **Thai has no word segmentation**: matching relies on spaces or prefixes (finding, not fixed) |
| PDF tools | 1.3 line only | Page Manager (undo/redo), Images→PDF, PDF→Images (JPG/PNG), Merge, Split; up to 100 pages | pageTools, pageToolsEngine, pageToolsUi, imageExport | **`advancedPdf` / `convert` flags are in PRODUCTION_OFF but never checked, so these tools ship in release.** Owner decision: intended? |
| Import / export / share / print | yes | Import photos (multi) and PDF; share PDF; print (Android, streamed, no plaintext file); save page images to a chosen folder | printNoPlaintext, imageExport, pageToolsUi | no "save PDF to device"; share leaves a plaintext copy until the next launch |
| Account | 1.3 line only | Register / verify / login / forgot / reset / My account / devices / delete; shown only when env + flag are set | accountAuth 38, accountScreens 11, accountIsolation 15, accountUpgrade 9, authLinkIntent 5 | backend not production-deployed; account routes are deep-linkable even when account is off (finding) |
| Settings / Me | yes | Appearance, language, OCR language, scan quality, file-name prefix, about, legal in-app | v13MeToolsNaming, i18n, legalScreen | Storage cell is static text |
| Security / privacy | yes | Shows encryption on; privacy explanation | productionGate, privacyGuards | app lock and screenshot protection are settings stubs (release-hidden) |
| AI / cloud / redaction / pricing | stubs | release-hidden via `featureRoute` / flags | privacyGuards, pii | not product features for v1 |

## 3. Core engines (current implementation)

| Engine | Implementation | Status |
|---|---|---|
| Camera | CameraX 1.6.2 native view (`OneScanCameraView.kt`); ML Kit Document Scanner 16.0.0 fallback; expo-camera last resort | Implemented; black-preview/busy recovery; device QA needed |
| Auto crop | DocSeg (Kotlin/Swift/TS twins, `docseg.bin`) + classical detector + logistic ranker `CROP_MODEL` v1-1782; presence gate | Implemented; auto-apply off by design; FROZEN models |
| OCR TH/EN | Tesseract (tesseract4android 4.9.0, bundled tha+eng) for Thai/auto; ML Kit Latin for English-only (dev); 2480 px working copy | Implemented |
| Image processing | `PageProcessor.kt` warp + scan look / card look; tiers 2200/4000/source; 26 MP budget; OOM retry at 2480 | Implemented |
| PDF | Native `PdfWriter` (JPEG passthrough), `PdfRasterizer` (page by page), `PdfPrinter` (streamed) | Implemented |
| Document storage | `docs/<id>/{original,processed,preview,thumbnail}` + `document.pdf`, encrypted via `adopt()` | Implemented |
| Encryption at rest | AES-256-GCM chunked (`OSE1`), DEK wrapped by the Keystore KEK `onescan.kek.v1` | Implemented (**Android only**) |
| SQLCipher | `useSQLCipher: true`; key = HMAC(DEK); legacy-DB migration with verification | Implemented (**Android only**) |
| Android Keystore | KEK, non-exportable; key loss → `KeyLostException` (no silent regenerate) | Implemented |
| Search / index | FTS5 `document_fts` (title, body) | Implemented; Thai segmentation gap |
| Temp files | plain cache cleared each launch, 400 MiB LRU; drafts swept after 10 min; `.tmp` swept | Implemented with known gaps (§6) |
| Offline | All core flows are on device; no network at startup (tested); account optional | Implemented (host-tested; Airplane mode device QA not recorded) |

## 4. Receipt status (baseline only; nothing reopened)

| Item | Status |
|---|---|
| R1 | FROZEN (report `d604424`) |
| R2 | FROZEN (`219d858`). Oracle boundary → Case B for flattening, Case C for the product |
| Receipt Flatten | PARKED |
| Receipt Enhance | WAITING FOR OWNER REAL RECEIPTS. Validation tooling `373962d` FROZEN BEFORE REAL DATA; Pilot = 30 receipts; no tuning during the Pilot; not implemented in the app |
| Real Receipt Validation | BLOCKED: no receipts supplied yet |
| DocSeg (app crop) | Shipped in 1.2.0 (FROZEN); DocSeg Receipt Crop = BACKLOG |
| Custom Dewarp | NOT APPROVED |
| R3 | NOT APPROVED / DO NOT START |

## 5. Account / cloud status (1.3 line)

| Part | Status |
|---|---|
| App code | Complete for 1.3 scope (auth layer, screens, migration v3, TH/EN errors); 78 jest cases |
| Backend | One codebase (`backend/api`, 20 test cases), two hosts: **Supabase Edge Function `onescan-api`** (used by the preview build) and the **Cloudflare Worker** (planned production host; **never deployed**, `wrangler.toml` still has a placeholder URL) |
| Supabase | Migration `20261014000000_account_foundation.sql` (schema `app`, RPCs, pg_cron), auth config, email templates, 11 SQL test blocks. Preview project `kqvpwvexirxfxrfkyjbe`. **Live state not verifiable here**: the Supabase connector needs authorization, and no deploy log is recorded |
| Authentication | Email/password with verification, reset, sessions (refresh token in SecureStore), devices, sign-out all, delete with 14-day grace |
| Optional account | Yes. Without the 3 env values the app is 1.2 behaviour; no login wall; no network at startup |
| Sync / cloud | **Stub**: no adapters, `/cloud` release-hidden, API returns 404 for documents; spec says not in 1.3 |
| Real-device QA | **None recorded.** The checklist is empty; no QA1 build exists (planned: versionCode 14) |
| Deployment | Not production-deployed. No domain; Worker not deployed; Play signing fingerprint not added |
| **Real blockers** | **Owner actions:** <br>(1) Supabase "Allow" for the database part behind sign-out/devices/delete (the preview doc says these 3 menus error until installed) <br>(2) dashboard Redirect URL <br>(3) SMTP or team emails <br>(4) a domain + Worker deploy + Play app-signing SHA-256 for App Links (M1) <br>(5) M2 legal review / deletion web page / Data safety <br>(6) 2 devices + 2 emails for E2E |

## 6. Security status

| Area | Status |
|---|---|
| Encryption at rest | Android: documents AES-256-GCM + DB SQLCipher. **iOS: none** (native functions absent → plaintext fallback). iOS is not a release target today |
| Plaintext exposure | Every native reader decrypts into `cache/onescan/plain` (app-private). It is cleared at the next launch and capped at 400 MiB |
| Temp files | Drafts swept after 10 min; `.enc/.dec/.mig.tmp` swept; print is streamed (no file) |
| Known gaps | **(a)** OCR copy stays in the shared plain cache: fix `d1cbb22`, not merged. **(b)** Share PDF/image copy stays until the next launch (BACKLOG 1.2.1 #1). **(c)** The LRU trim may delete an in-use copy |
| OCR temp cleanup `d1cbb22` | Branch `claude/ocr-temp-cleanup`, 1 commit on `f744530`. Code review **PASS**, automated regression **PASS** (PlainTempTest 6/6 + module suite). **Real Android QA pending. NOT merged** (not merged in this audit either) |
| Keystore | Non-exportable KEK; key-loss handling. Device-only behaviour **not device-verified in the record** |
| Secrets | OneScan: no keystore or password in `onescan/` (`.gitignore` covers `*.jks/*.p12/*.key/*.p8`); signing via env / Gradle properties outside the repo; `EXPO_PUBLIC_*` values are public by design. **FINDING (not fixed):** the repo-root `/home/user/ship/.env` is **tracked in git**. It was committed in `0a80b98` (the 2025 upload, so it is in every branch's history) and contains `DATABASE_URL`. The value was not read. If it is a real connection string with a password, treat it as **exposed**: rotate the password, then remove the file from the repo. This is outside OneScan's code but in the same repository |
| Logs | No document content in analytics (sanitizer tested); telemetry settings release-off |
| Backup | `allowBackup=false`, `fullBackupContent=false`, data-extraction rules exclude everything |

## 7. Test status (recorded evidence; nothing re-run)

| Suite | Latest evidence | Applies to HEAD app code? |
|---|---|---|
| Jest | **358/358, 34 suites** @ `f744530` (Phase B) | **Yes**: app code unchanged since |
| Jest (1.2.0) | 168/168, 17 suites @ `78c0121` | Release baseline only |
| TypeScript `tsc` | PASS @ `78c0121`; 1.3 checkpoints reported tsc + 0 ESLint errors (pre-Phase-A) | **NOT VERIFIED @ `f744530`** (not recorded for Phase B) |
| ESLint | `78c0121`: 1 error (Viewer `react-hooks/refs`, fixed later in `3eb347f`) + 4 warnings | **NOT VERIFIED @ `f744530`** |
| Native / Kotlin JVM | 20/20 @ `78c0121`; "pass" @ `f744530` (count not recorded); PlainTempTest 6/6 + suite @ `d1cbb22` | Pass recorded, count STALE |
| Backend Worker tests | 20 cases exist | **NOT VERIFIED** (no recorded run result) |
| Supabase SQL tests | 11 blocks exist | **NOT VERIFIED** (no recorded run result) |
| Android release build + R8 | PASS @ `78c0121` (1.2.0 AAB); preview APKs built for the 1.3 line | 1.3 line: preview builds only, no QA build |
| Real device | **No recorded results** (RC4 sheet blank; account QA blank; Phase A/B device gates unfilled). The 1.2.0 record notes an Owner smoke test of the Viewer only | — |
| Performance | Host only: Phase B JS overhead with native work mocked (100 pages ≈ 524 ms) | No device numbers |
| Security | Host: SecureFilesTest, printNoPlaintext, privacyGuards, productionGate | Device checks not recorded |
| Offline | Host: no network at startup (accountIsolation) | Airplane mode on device not recorded |

## 8. Release status — how close to production?

| Check | 1.2.0 (release baseline) | 1.3 line (HEAD) |
|---|---|---|
| AAB | **Built** (`OneScan-v1.2.0-Production.aab`, SHA-256 `3ceb3a33…`) | None (preview APKs only) |
| versionCode / versionName | 13 / 1.2.0 | app.json still 1.2.0 / **12**. Must become ≥ 14. **Preview APKs already used 13**, the same number as the 1.2.0 AAB |
| Signing | Upload key, cert SHA-256 `1c10565d…`; release fails without the key (never debug) | Same mechanism |
| R8 / mapping | Yes / mapping file kept | – |
| Play Store readiness | Release notes TH/EN ready; **not uploaded**; versionCode history in Play must be confirmed by the Owner; Data safety form / store listing not recorded | Plus M2 (deletion page, Data safety for accounts) |
| Blockers | **(1)** Real-device QA results for RC4 / Production AAB not recorded. **(2)** Owner upload decision. **(3)** Play listing + Data safety | Everything for 1.2.0, plus: <br>• no QA build <br>• no device QA <br>• account backend not deployed <br>• M1/M2 <br>• advancedPdf/convert gating decision <br>• `d1cbb22` decision |

## 9. Branch / commit map (nothing merged)

| Branch | Commit | Purpose | Status | Merged into HEAD? | Keep / Review / Discard |
|---|---|---|---|---|---|
| `claude/release-1.2.0` | `78c0121` | 1.2.0 Production source (RC4 + versionCode 13) | Release baseline, AAB built, not uploaded | No (sibling of HEAD) | **KEEP**: the production baseline |
| `apk-builds` | `aa9bc82` | Built APKs/AABs, release records, QA sheets, preview docs | Artifact store | No (separate history) | **KEEP** |
| `claude/onescan-mobile-v1` | local `eae3db8`, origin `b2a175b` | 1.2.0 RC line (RC4 = `b2a175b`) | Superseded by the release branch | Yes | Keep (history); local is behind origin |
| `claude/native-ux` | `b2a175b` | V2 UI (RC4) | Included | Yes | Keep (history) |
| `claude/home-redesign` | `1877e36` | RC3 home | Included | Yes | Keep (history) |
| `claude/account-1.3` | `f744530` | 1.3 line: account + V3 + Doc Tools A/B | Code complete, no device QA | Yes (HEAD contains it) | **KEEP**: next-release source |
| `claude/ocr-temp-cleanup` | `d1cbb22` | OCR plaintext temp fix | Review + automated PASS; device QA pending | **No** | **REVIEW** (merge decision after device QA) |
| `claude/receipt-restore-rd` | `373962d` | Receipt R&D R1/R2 + Enhance validation | FROZEN | Yes | Keep (R&D record) |
| `claude/agent-skills-baseline` | `ec13c1c` (+ this report) | Agent tooling + internal skills | Approved / ready for review | = HEAD | Keep |
| `claude/onescan-scan-qa-wip` | `1b83cfc` | WIP chroma-aware tone curve | "NOT evaluated, not merged" | No | **REVIEW → likely DISCARD** (ColourInk work shipped another way in RC1) |
| `claude/logo-redesign` | `3eb2eff` | Logo concepts round 2 (no app change) | Design exploration | No | Review (design only) |
| `origin/ship-apk-builds` | `09542a1` | "Android test builds v0.1.1 with demo mode": **another product** (delivery app) | Unrelated | No | Not OneScan; owner's other project |
| `origin/claude/delivery-platform-mvp` | `ba5dec1` | Delivery platform: another product | Unrelated | No | Not OneScan |
| `origin/claude/nong-chang-product-spec-k8o9z4` | `5a1f3d7` | Another product spec | Unrelated | No | Not OneScan |
| `main` | `0a80b98` | Old upload (2025) | Does not contain OneScan | – | Owner to decide the long-term default branch |

## Final owner view

### Where OneScan is
OneScan has a **finished, signed 1.2.0 Production AAB** that passed every automated gate, but **it has
no recorded real-device QA result and has not been submitted to Play**. A larger **1.3 line**
(accounts + V3 UI + Document Tools) is code-complete on host tests but has had **zero recorded
device QA**, and its account backend is not production-deployed.

### Estimate (each % is a count of required gates, not a feeling)
- **1.2.0 to Production: about 70% (7 of 10 gates).**
  - Done:
    1. features in scope
    2. host tests
    3. release build + R8
    4. signing
    5. security config
    6. production flag gating
    7. release notes
  - Missing:
    8. recorded real-device QA
    9. Play listing / Data safety
    10. Owner upload
- **1.3 line to Production: about 40% (4 of 10 gates).**
  - Done:
    1. code complete
    2. host tests (jest 358/358)
    3. preview builds
    4. backend code + tests written
  - Missing:
    5. QA build (versionCode ≥ 14)
    6. device QA (V3, Tools A/B, account)
    7. backend production deploy
    8. M1 App Links
    9. M2 legal / deletion / Data safety
    10. Owner release decision

### Done (with evidence)
- Scan → crop review → filters → on-device Thai/English OCR → encrypted save → list/folders → viewer
  → FTS search → share/print PDF → import (1.2.0, jest 168/168, native 20/20, release build).
- Encryption at rest on Android (AES-256-GCM + Keystore + SQLCipher), backup disabled.
- Document Tools A/B and the account app layer (jest 358/358 @ `f744530`).
- OCR temp fix (`d1cbb22`: review + 6/6 tests).

### Almost done
- 1.2.0 release: needs only device QA results + Play submission.
- `d1cbb22`: needs device QA + a merge decision.

### Not done
- Any recorded real-device QA.
- 1.3 QA build.
- Account production deploy.
- Thai word segmentation in search.
- Trash.
- Save-PDF-to-device.
- iOS encryption.

### Blocked (by Owner actions)
- Account E2E (Supabase Allow, Redirect URL, emails, 2 devices).
- App Links (domain, Worker deploy, Play SHA-256).
- M2 (legal, deletion page, Data safety).
- Receipt Enhance (30 real receipts).

### Not needed for the first version
- Accounts / cloud sync.
- AI.
- Pro / pricing.
- App lock.
- Redaction copies.
- Auto-capture.
- Receipt Enhance / Flatten / R3.
- iOS (if v1 is Android-only).

### Top risks before production (5 + 1 repository-level)
1. **No recorded real-device QA** for any build. Crash, OOM or camera issues on real phones are
   unmeasured (P0 class).
2. **versionCode confusion:**
   - app.json = 12, release = 13, and 1.3 preview APKs also used 13.
   - The next upload must be ≥ 14 for 1.3, and Play's actual history must be confirmed.
3. **Plaintext residue:** the OCR copy (fix unmerged) and share copies stay in the app cache until
   the next launch. App-private, but longer than necessary.
4. **Release gating mismatch:** `advancedPdf` / `convert` are declared production-off but never
   enforced, so the 1.3 tools ship visibly. Plus account routes are deep-linkable while account is
   off.
5. **Secret in git history:** the repo-root `.env` (`DATABASE_URL`) is tracked since `0a80b98`. If real, it is exposed to anyone with repo access (needs Owner rotation; not fixed).
6. **Thai search:** FTS unicode61 has no Thai word segmentation, so in-word Thai searches may miss.
   Only partly covered by prefix matching; needs device verification with real Thai documents.

## RECOMMENDED NEXT STEP (one)

**Run and record real-device QA of the already-built 1.2.0 Production AAB:** the 8-step critical
smoke test, then the full `QA-RESULTS-RC4.md` sheet on at least 2 Android phones, using the exact
AAB (install via internal testing or bundletool), and decide GO / NO-GO for the Play upload.

**Why this has the highest priority:**
- It is the only path to production that needs **no new code**. 1.2.0 is built, frozen and
  automated-green; the only missing evidence is real devices.
- It is also the cheapest way to de-risk everything after it. 1.3 is 1.2.0 plus extra features, so
  any P0 found in the 1.2.0 core (camera, save, encryption, OCR, PDF, 20 pages) would also be in 1.3.
- Every other item is either blocked on Owner infrastructure (account, App Links, M2), waiting on
  data (receipts), or depends on device QA anyway (`d1cbb22`).

**Open questions on this step (Owner decides):**
- Whether 1.2.0 ships with the known OCR / share plaintext-cache behaviour (cleared at next launch,
  app-private), or waits for `d1cbb22`. That would need a new versionCode and a rebuild.

**Waiting (not started):**
1. Device QA of `d1cbb22` → merge decision.
2. 1.3 QA build (versionCode ≥ 14) + device QA.
3. Account infrastructure (Supabase Allow / Redirect URL / domain / Worker).
4. M2 legal + Data safety.
5. Receipt Enhance Pilot (30 receipts).
6. Decide the `advancedPdf` / `convert` gating intent.

Status: **OneScan Current Application Status — READY FOR OWNER DECISION.** The agent will not start
the recommended step.
