---
name: onescan-android-testing
description: How to test OneScan and how to label results - JS unit/integration (jest), Kotlin JVM unit tests, screenshot harness, emulator checks, and real-device QA (offline/Airplane mode, permissions, process death, low memory, rotation/lifecycle, storage pressure, security regression). Use before reporting any task as done, and whenever QA, regression or device validation is requested. Distinguishes HOST TEST, EMULATOR TEST and REAL DEVICE TEST; never report host/emulator results as real Android QA.
---

# OneScan — Android testing

## Three test levels — always label results with one of them

| Level | What it proves | What it cannot prove |
|---|---|---|
| **HOST TEST** | Logic, contracts, file lifecycle with a test key, pixel algorithms on the JVM | Keystore, CameraX, real OCR speed, memory, ANR, R8, permissions UI |
| **EMULATOR TEST** | App launch, navigation, permission flows, process death, rotation | Real optics, real performance, OEM camera quirks, thermal |
| **REAL DEVICE TEST** | Everything above on that device and build | Other devices |

**Never report HOST or EMULATOR results as "Real Android QA".** This cloud container has no KVM and
no device, so only HOST is possible here. Emulator and real-device runs are done by the Owner, or on
an approved machine.

## HOST commands (run from `onescan/`)
- **Typecheck:** `npx tsc --noEmit`
- **Lint:** `npx expo lint`
- **JS tests:** `npx jest`
  - Preset jest-expo; matches `src/__tests__/**/*.test.ts(x)` (34 files).
  - Run a subset by path for focused work.
- **Kotlin JVM tests:**
  - Command: from `onescan/android/`, run `./gradlew :onescan-vision:testDebugUnitTest`. Confirm
    the project name with `./gradlew projects` if it fails.
  - `android/` is generated (CNG) and may be stale. If the build config changed, regenerate it with
    `npx expo prebuild --platform android` (local only; it does not touch tracked files).
  - Tests: `SecureFilesTest`, `PageProcessorTest`, `DocSegTest`, `FrameStatsTest`,
    `ColourInkTest`, `PdfWriterTest`, `PdfRasterizerTest` (+ `PlainTempTest` on the
    `d1cbb22` branch).
- **Screenshots** (visual only, web renderer): `src/__screens__/shoot.js`. These are **not** device
  screenshots.
- **Not part of the test suite:**
  - `src/__rr__` (Receipt R&D harness, FROZEN)
  - `tools/receipt_restore` (host Python R&D, FROZEN)
- **No instrumentation tests exist** (no `androidTest`, Detox or Maestro). Adding a framework is a
  dependency change, which needs Owner approval.

## Test design rules
- Test failure paths, not only the happy path:
  - exception
  - cancel / timeout
  - interruption
  - tampered or truncated encrypted input
  - disk full
  - module absent (`requireOptionalNativeModule` returns null)
- Security regressions:
  - `printNoPlaintext`, `privacyGuards`, `productionGate`, `imageExport`, `SecureFilesTest` must
    stay green.
  - A file-lifecycle change adds a "no plaintext left" assertion (see `onescan-temp-file-safety`).
- Do not delete, skip or weaken an existing test to get green.
- Do not re-run frozen benchmarks (Receipt R1/R2, DocSeg training) as "tests".

## REAL DEVICE QA checklist
Record for each run: device, Android version, RAM, build type and versionCode.

| Area | Steps | Evidence |
|---|---|---|
| Offline / Airplane mode | Airplane ON for the whole run: scan, OCR, PDF, export | Everything works; no network errors shown; optionally `dumpsys netstats` unchanged |
| Permissions | First run deny; deny + "don't ask again"; grant from Settings; revoke while the app is in background | Correct UI each time, no crash, ML Kit fallback where designed |
| Process death | `adb shell am kill app.onescan.mobile` while backgrounded mid-scan / mid-OCR / mid-export; relaunch | No crash; drafts recovered or cleaned; no plaintext residue (`run-as ... find cache files`) |
| Low memory | Large captures (26 MP), long PDFs; `adb shell am send-trim-memory app.onescan.mobile RUNNING_CRITICAL` | No OOM crash; `degraded` path works |
| Rotation / lifecycle | App is portrait-locked: background/foreground during camera, screen off/on, switch apps during the system scanner | Camera rebinds; no black preview; scanner result not lost |
| Storage pressure | Fill the device to < 250 MB / < 100 MB free | Low-disk messages; no partial or corrupt documents |
| Security regression | Backup (`adb backup` / data extraction) excluded; files under `docs/` start with `OSE1`; DB not readable as plain SQLite | Commands + output |
| Crash / ANR | `adb logcat -b crash`, `dumpsys activity anr` after the session | 0 / 0 |

## Report
Give results per level, the exact commands, pass/fail counts, failures with logs, and anything not
tested.
