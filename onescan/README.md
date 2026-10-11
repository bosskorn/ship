# OneScan (working name) — Mobile App

**Scan → Understand → Protect → Act.** Local-first, privacy-first document scanner built with
React Native + Expo (SDK 57) and Expo Router. Cloud and AI are optional and off by default.

```bash
npm install
npx expo start            # dev server (development build required for camera/vision)
npm run typecheck         # tsc --noEmit
npm test                  # unit tests (engine, privacy guards, i18n parity)
npm run lint
```

## Structure

```
src/
  app/                 Expo Router routes only (thin re-exports of feature screens)
  navigation/          Tab bar adapter + registry of every spec route (§61) with release/flag
  features/            Screens + feature state (home, scanner, editor, documents, viewer,
                       search, ai, profile, privacy, tools, cloud, subscription, onboarding)
  design-system/       Tokens (color/spacing/radius/type/motion), ThemeProvider, T* components
  core/
    document-engine/   UI-agnostic engine (SDK-ready): Capture, Image, OCR, PDF, Redaction,
                       Security, Export, Sync, AI + DocumentEngine facade
    database/          expo-sqlite schema/migrations, repositories, local search parser (FTS5)
    config/            Settings store (privacy defaults), remote config (plans/flags/credits)
    i18n/              en (source of truth) + th, typed keys, Intl formatting (Buddhist year)
    networking/        Backend client (Cloudflare Workers)
    storage/           Local KV persistence
  services/analytics/  Event schema + sanitizer that drops document content
  native/              Contract for the on-device vision module (Vision / ML Kit)
```

## Product rules enforced in code

| Rule (spec §66) | Where |
| --- | --- |
| Local-first, no auto upload | `core/document-engine/sync/syncPolicy.ts` — `canUpload` blocks unless cloud is on, a provider is set, and the payload is encrypted |
| AI off by default, per-request consent | `core/document-engine/ai/aiPolicy.ts` — `prepareAiPayload` requires `allowAI`, matching consent, TTL, and a second confirmation to send the original |
| Redaction on device | `core/document-engine/redaction/*` — pure TS PII detection (Thai ID/tax checksum, Luhn, phones, bank, passport, address, medical) + masking |
| Basic scan on device | `DocumentEngine` performs no network I/O |
| No mandatory login | Guest by default; onboarding → scan |
| No hard-coded pricing / provider | `core/config/remoteConfig.ts` (no plans in fallback); AI goes only through `/v1/ai/run` on the gateway |
| No document content in analytics | `services/analytics/sanitize.ts` — allow-listed events, forbidden keys, enum-like values only |
| E2E encrypted vault | `core/document-engine/security/vaultCrypto.ts` — AES-256-GCM with a Keychain/Keystore key |
| No hard-coded strings / colors | i18n keys everywhere; components read tokens via `useTheme()` |

## Native vision module (`modules/onescan-vision`)

Local Expo module, autolinked. Contract: `src/native/OneScanVision.ts`.

| Capability | Android (Kotlin) | iOS (Swift) |
| --- | --- | --- |
| Scanner camera + live frames | CameraX `PreviewView` + `ImageAnalysis` (Y plane) | `AVCaptureSession` + video data output (Y plane) |
| Edge detection / auto capture | shared JS detector `core/document-engine/capture/quadDetector.ts` + `AutoCaptureController` | same |
| Perspective correction | `Matrix.setPolyToPoly` | `CIPerspectiveCorrection` |
| Enhance / shadow removal / filters | per-block paper estimate + division, Otsu B&W | morphology + blur + divide kernel, Otsu B&W |
| OCR | ML Kit (Latin) + Tesseract `tha+eng` (bundled models) | Vision `VNRecognizeTextRequest` |
| PDF import | `PdfRenderer` | PDFKit |
| Image redaction | Canvas | UIGraphicsImageRenderer |

Requires a development build (`npx expo run:android` / `npx expo run:ios`); Expo Go and web
fall back to expo-camera, manual capture and no OCR.

## Status

V1.0 per spec §68: open → scan (live border, auto capture) → perspective crop → enhance →
multi-page → on-device OCR (Thai + English) → PDF → local search → share — no login, no upload.

Also built: manual crop, Clean, filters, reorder/duplicate/rescan, PDF import with page
rendering + OCR, duplicate document, sensitive-data detection and on-device redacted copies,
Trash, AI consent gate (gateway call behind the `ai` flag).

Verification: unit tests (JS engine, detector, privacy guards, i18n parity, Android pixel
algorithms incl. JVM tests for the Android pixel pipeline); Android `assembleDebug`/`assembleRelease` build. The iOS module is written against
AVFoundation/Core Image/Vision/PDFKit but has not been compiled in CI (no macOS runner).

Not built yet (behind remote flags, routed to `/unavailable`): markup, App Lock (V1.1),
AI chat/results + credits (V1.2), cloud sync (V1.3), Pro PDF tools/convert (V1.4), sign-in.

Web is a development preview target only (`npx expo start --web`); the product is native.
