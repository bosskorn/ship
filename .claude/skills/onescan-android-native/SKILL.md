---
name: onescan-android-native
description: OneScan Android native work - Kotlin in the local Expo module onescan-vision, Gradle, CNG config plugins, permissions, Android/activity lifecycle, the JS-native bridge, R8/ProGuard keep rules, debug vs release differences. Use when a task touches modules/onescan-vision/android, app.json android/plugins, plugins/*.js, or src/native/OneScanVision.ts. Not for storage crypto (onescan-secure-documents) or camera/CV algorithms (onescan-camera-vision).
---

# OneScan — Android native

Paths below are relative to `onescan/`. `K/` means
`modules/onescan-vision/android/src/main/java/app/onescan/vision/`.

## Workflow (mandatory)
READ BASELINE (`/home/user/ship/CLAUDE.md`) → LOCATE the current implementation (files below) →
CHECK FROZEN status → DEFINE MINIMAL CHANGE → IMPLEMENT → TEST (`onescan-android-testing`) →
REPORT → STOP.

Read the existing Kotlin and its JS wrapper **before** editing. Never write a parallel
implementation.

## Where things are
- **CNG: `android/` is generated and gitignored.** It is often stale on disk (e.g. versionCode 13
  vs app.json 12). Never edit `android/` by hand. Native config lives in:
  - `app.json`: package `app.onescan.mobile`, `allowBackup:false`, `blockedPermissions`
    RECORD_AUDIO / SYSTEM_ALERT_WINDOW, and `expo-build-properties` (R8 + shrink in release,
    ABIs arm64-v8a / armeabi-v7a, jitpack repo, `extraProguardRules`).
  - `app.config.js`: optional verified App Link from `EXPO_PUBLIC_APP_LINK_HOST`.
  - `plugins/withPrivacyHardening.js`: backup off, data-extraction rules.
  - `plugins/withReleaseSigning.js`: upload-key signing from env/gradle properties; release fails
    without it. See `onescan-release-safety`.
- **Module:** `modules/onescan-vision/`
  - `expo-module.config.json`: android class `app.onescan.vision.OneScanVisionModule`, JS name
    `OneScanVision`.
  - `android/build.gradle`, with pinned dependencies — do not change them:
    - CameraX 1.6.2, exifinterface 1.4.2
    - ML Kit text-recognition 16.0.1 + document-scanner 16.0.0
    - tesseract4android 4.9.0
    - junit 4.13.2
  - `noCompress 'traineddata'`.
  - Module manifest: CAMERA permission, camera `required=false`, `largeHeap=true`.
  - Assets: `assets/tessdata/{tha,eng}.traineddata`, `assets/docseg.bin`.
- **Kotlin files:**
  - `K/OneScanVisionModule.kt`: about 20 `AsyncFunction`s, all on the default async queue except
    `printPdfAsync` (MAIN). Also the `OneScanCameraView` view.
  - `ImageIO.kt`, `PageProcessor.kt`, `CardLook.kt`, `DocSeg.kt`, `TextRecognizer.kt`
  - `PdfWriter.kt`, `PdfRasterizer.kt`, `PdfPrinter.kt`
  - `SecureFiles.kt`, `DocumentScanner.kt`, `FrameStats.kt`
- **JS bridge:** `src/native/OneScanVision.ts`
  - Uses `requireOptionalNativeModule`, so the module can be absent (iOS / web / old builds).
    Every caller must handle "native missing".
  - Readers are wrapped by a `gated()` proxy that awaits `plainCacheReady()`.
  - Camera view wrapper: `src/native/OneScanCameraView.tsx`.

## Lifecycle facts (current behaviour — do not "fix" without a task)
- The module has `OnCreate` (SecureFiles.init) and `OnActivityResult` (document scanner) only.
  It has no foreground/background hooks.
- **Camera view:**
  - Binds in `onAttachedToWindow` and unbinds in `onDetachedFromWindow`.
  - The `active` prop binds or unbinds; `retryToken` rebinds.
  - Uses `bindToLifecycle(activity)` and a single-thread analysis executor that is shut down on
    unbind.
  - A no-frame watchdog (6 s) is skipped while the activity is not RESUMED.
- `DocumentScanner` keeps one static pending Promise (`E_SCANNER_BUSY` on a second call).
  **Known risk:** after process death that promise is never resolved.
- Tesseract runs under `synchronized(tessLock)` and calls `recycle()` in `finally`.
- There are no native timeouts. JS-side timeouts: OCR 60 s (`OCREngine.ts`), scan finish 45 s
  (`ScannerScreen.tsx`).

## Rules
- **Permissions:**
  - Add none without Owner approval.
  - Never remove an entry from `blockedPermissions`.
  - Camera is requested at runtime, and every path must handle "denied" and "don't ask again".
- **R8:** any class reached by reflection or JNI needs a keep rule in `extraProguardRules`.
  Existing rules cover `app.onescan.vision.**`, tesseract/leptonica and `expo.modules.sqlite.**`.
  A new native class outside those packages needs a rule, and must be verified with a **release**
  build (see testing).
- **Debug vs release:**
  - `__DEV__` gates devTools / Scan Diagnostics.
  - `remoteConfig.PRODUCTION_OFF` forces features off in release.
  - Never test a security or perf claim only in debug.
- **New native function:** follow the existing pattern.
  - `AsyncFunction` in the module, typed in `OneScanVision.ts`.
  - Add it to `READS_DOCUMENT_FILES` if it reads document files.
  - It must work when the module is absent.
- No network I/O in native code (the module doc promises this).
- No dependency or SDK change.

## Done means
- JS: `npx tsc --noEmit`, `npx jest`, `npx expo lint` pass on HOST.
- Kotlin: the module JVM tests pass (HOST).
- Behaviour on Android is claimed only with EMULATOR or REAL DEVICE evidence, labelled as such.
