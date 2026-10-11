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

## Status (V1.0 foundation)

Working: design system (light/dark), navigation (5 tabs, Scan opens camera), onboarding,
Home, camera with permission flow / flash / grid / modes / multi-page / gallery import,
multi-page editor (rotate, filters, reorder, duplicate, rescan, delete), PDF generation
(on-device via the print engine), local DB + Documents/Folders/Recent, viewer, Trash with
retention, local search (title, OCR text, folder, type, month/year incl. Thai months/BE years),
Share, Privacy & Data, language/appearance, Tools center, AI consent flow (gateway call gated
by the `ai` flag).

**Requires the native vision module** (`src/native/OneScanVision.ts` describes the contract):
live edge detection + auto capture, perspective correction, pixel-level filters/shadow
removal, on-device OCR, image redaction. Until it ships, the app falls back to full-frame
capture, CSS-applied filters in the PDF, and "OCR unavailable". `AutoCaptureController`
(tested) is ready to consume native detections.

Not built yet (routed to `/unavailable`, behind remote flags): manual crop/markup/clean,
redaction UI (V1.1), App Lock (V1.1), AI chat/results + credits (V1.2), cloud sync (V1.3),
Pro PDF tools/convert (V1.4), account/sign-in.

Web is a development preview target only (`npx expo start --web`); the product is native.
