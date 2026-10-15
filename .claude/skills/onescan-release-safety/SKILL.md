---
name: onescan-release-safety
description: Knowledge and guardrails for OneScan Android releases - debug vs release, upload-key signing via withReleaseSigning, versionCode/versionName, AAB, R8/shrink, secrets and EXPO_PUBLIC env, release checklist, Play Store preparation, rollback. Use when a task mentions release, RC, version bump, signing, AAB, Play Store, or production build. GUARDRAIL ONLY - the agent must not build, sign, upload, submit or publish production without explicit Owner approval.
---

# OneScan — release safety (guardrail)

## Hard stop
Without an explicit Owner approval **for this specific action**, the agent does NOT:
- build a production / release artifact
- sign with the upload key
- upload or submit to Google Play or any store, or promote a track
- run any EAS cloud command (denied in `.claude/settings.json`)

On a release request, prepare the checklist and a version proposal, then **STOP and ask**. Approval
in one context does not carry to the next action.

## Current facts
- **Version:**
  - `app.json`: version `1.2.0`, `android.versionCode` 12, `ios.buildNumber` "6".
  - History is in `git log -- onescan/app.json`.
  - The generated `android/` on disk may show other values (e.g. 13, "1.3.0-account-preview").
    app.json is the source of truth.
- **Plan:** the 1.3 account docs in `onescan/docs/account/` plan `1.3.0` QA at versionCode 14 and
  production at versionCode > 13. versionCode must always increase; never reuse one.
- **Signing** (`plugins/withReleaseSigning.js`):
  - Reads `ONESCAN_UPLOAD_STORE_FILE`, `ONESCAN_UPLOAD_STORE_PASSWORD`,
    `ONESCAN_UPLOAD_KEY_ALIAS` and `ONESCAN_UPLOAD_KEY_PASSWORD` from Gradle properties or the
    environment.
  - Any release task **fails** if they are unset. It never falls back to the debug key.
  - The keystore and passwords live outside the repo on the build machine. **Never read, print,
    copy, commit or move them**, and never put them in a skill, doc or log.
  - `.gitignore` covers `*.jks`, `*.p12`, `*.key`, `*.p8`.
- **R8:**
  - `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds` are true.
  - Keep rules live in `app.json` `extraProguardRules`.
  - Release-only crashes (missing keep rule) appear only in a release build. Test the release build,
    not debug.
- **Debug vs release behaviour:**
  - `!__DEV__` forces `remoteConfig.PRODUCTION_OFF` features off: ai, cloudBackup, externalCloud,
    pro, appLock, redaction, trash, devTools, auto_capture_enabled and others
    (`productionGate.test.ts`).
  - Scan Diagnostics is unreachable in release.
- **Environment:**
  - `EXPO_PUBLIC_*` values are **embedded in the app and public**: API base, Supabase URL + anon
    key, account API, App Link host. Never put a secret in an `EXPO_PUBLIC_` variable.
  - Supabase service_role keys never go in the app, repo or chat.
  - With no account variables set, the app behaves as 1.2 (no account UI).
  - `scripts/verify-app-links.mjs` checks App Links (M1).
- **Backup and privacy:** `withPrivacyHardening` (backup off) must be present in any release.
- **Pending security fix:** `d1cbb22` (OCR temp) is not merged. Whether it goes into a release is
  an Owner decision. It is not tied to Receipt Enhance.

## Release checklist (prepare; do not execute the release steps)
1. Owner approval recorded: scope, version, track.
2. Clean tree on the approved commit. `npx tsc --noEmit`, `npx jest`, `npx expo lint` and the
   Kotlin tests are green (HOST).
3. versionCode > last uploaded; versionName agreed.
4. `npx expo prebuild --clean` from tracked config only. No hand edits in `android/`.
5. No secrets in the repo or in `EXPO_PUBLIC_*`: `git grep` for keys/tokens; check `.env*`.
6. Release build with R8 on a REAL DEVICE: smoke test, offline, permissions, security checks (see
   `onescan-android-testing`).
7. AAB signed with the **upload key**. Record the cert SHA-256, never the passwords.
8. Play preparation: store listing, data-safety form (documents stay on device), content rating,
   target SDK. The Owner submits or approves submission.
9. **Rollback plan:**
   - Play cannot roll back a versionCode. Rollback = halt the staged rollout and ship a fixed
     higher versionCode.
   - Use a staged rollout (e.g. 5–10%) and watch crash/ANR vitals.
   - Keep the previous AAB and its commit hash.
   - DB migrations must stay forward-compatible: no destructive schema change without a migration
     test.

## Report
Give the checklist status per item, open blockers and the exact approval requested.
