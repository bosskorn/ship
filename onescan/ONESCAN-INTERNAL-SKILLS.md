# OneScan Internal Mobile Skills — READY FOR OWNER REVIEW

**Scope:** Agent tooling only. No application code, dependency, SDK, algorithm or threshold changed.
No build, no merge.

**Branch:** `claude/agent-skills-baseline`, on top of the approved baseline `932715c`.

## 1. Skills created (`/home/user/ship/.claude/skills/`, project scope, loaded on demand)

| Skill | Lines | Use when |
|---|---|---|
| `onescan-android-native` | 90 | Kotlin in `onescan-vision`, Gradle, CNG plugins, permissions, lifecycle, JS↔native bridge, R8, debug vs release |
| `onescan-camera-vision` | 101 | Camera, live detection, EXIF, DocSeg crop, warp/filters, resolution tiers, OCR, PDF, QR/barcode preservation |
| `onescan-secure-documents` | 101 | Anything that reads/writes/decrypts/exports/deletes documents or the DB: AES-GCM, Keystore, SQLCipher, plain cache, backup, cloud/AI gates |
| `onescan-temp-file-safety` | 69 | Any file creation/decrypt/rename/delete: CREATE→USE→CLOSE→DELETE audit across success, exception, cancel, interruption, process death, stale cleanup |
| `onescan-android-performance` | 76 | RAM/bitmap/native/JS memory, P50/P95, OOM, ANR, startup, long documents, large images, thermal; measure before and after |
| `onescan-android-testing` | 73 | Before reporting done; QA/regression/device validation; HOST / EMULATOR / REAL DEVICE labelling |
| `onescan-release-safety` | 75 | Release, version, signing, AAB, R8, secrets, Play prep, rollback. **Guardrail only** |

**Every skill enforces the same workflow:**
READ BASELINE → LOCATE CURRENT IMPLEMENTATION → CHECK FROZEN → MINIMAL CHANGE → IMPLEMENT → TEST →
REPORT → STOP.

**Shared rules live once, in `/home/user/ship/CLAUDE.md`, which loads every session.** They are not
copied into each skill:
- workflow
- anti-loop rule (COMPLETE / PASS / FROZEN / PARKED / NOT APPROVED → DO NOT REOPEN unless one of
  four exceptions applies)
- precedence
- prohibitions
- hand-over / context preservation

### Task → skill map
| Task | Load |
|---|---|
| OCR temp file / plaintext | `onescan-secure-documents` + `onescan-temp-file-safety` + `onescan-android-testing` |
| Camera | `onescan-camera-vision` + `onescan-android-performance` + `onescan-android-testing` |
| Native module / Gradle / permissions | `onescan-android-native` (+ `onescan-android-testing`) |
| Memory / speed / OOM / ANR | `onescan-android-performance` (+ `onescan-camera-vision` if in the pipeline) |
| QA run | `onescan-android-testing` (+ `onescan-temp-file-safety` for residue checks) |
| Release request | `onescan-release-safety` |
| UI screen | Expo `expo-native-ui` (+ `expo-router`) |
| New native function | `onescan-android-native` + Expo `expo-module` |

## 2. Sources used
Three read-only research passes over the current code, plus direct reads. No new design.

- **Native module:**
  - Folder: `modules/onescan-vision/android/src/main/java/app/onescan/vision/*.kt`
  - Kotlin files: SecureFiles, ImageIO, PageProcessor, CardLook, DocSeg, TextRecognizer,
    OneScanCameraView, DocumentScanner, PdfWriter, PdfRasterizer, PdfPrinter, FrameStats,
    OneScanVisionModule
  - Also: `build.gradle`, `AndroidManifest.xml`, `expo-module.config.json`
- **JS:**
  - `src/native/OneScanVision.ts`, `src/native/OneScanCameraView.tsx`
  - `src/core/document-engine/{capture,image,ocr,pdf,storage,security,sync,ai}`
  - `src/core/database/db.ts`, `src/core/config/{env,remoteConfig}.ts`
  - `src/features/scanner/*`, `src/features/shared/bootstrap.ts`
- **Configuration:**
  - `app.json`, `app.config.js`
  - `plugins/withPrivacyHardening.js`, `plugins/withReleaseSigning.js` (secret values were not
    read or printed)
  - `package.json` (jest config), `.gitignore`
- **Tests:**
  - `src/__tests__/*` (34 files)
  - Kotlin `src/test/*` (7 files)
  - `src/__screens__`, `src/__rr__`
- **Docs:**
  - `AGENTS.md`, `CLAUDE.md`, `ONESCAN-AGENT-SKILLS-BASELINE.md`
  - `docs/account/*`
  - Receipt R1/R2/Enhance reports (status only)
- **Branch `claude/ocr-temp-cleanup` `d1cbb22`:** used only to describe the `withPlainTemp` pattern
  and its status.

## 3. Facts recorded in the skills that the Owner should know
These are recorded, not fixed. Fixing any of them needs a task.

| # | Fact | Skill |
|---|---|---|
| 1 | OCR plaintext copy in the shared plain cache — fix `d1cbb22` awaits real Android QA, not merged | secure-documents, temp-file-safety |
| 2 | Share PDF / share image leaves a plaintext copy in `cache/onescan/plain` until the next launch or the LRU trim | secure-documents |
| 3 | The plain-cache LRU trim can delete a copy that is still being read | secure-documents |
| 4 | **iOS has no file encryption and no SQLCipher key** (native functions absent → plaintext fallback) | secure-documents |
| 5 | The app does not decode or verify QR/barcodes. Preservation can only be checked with host tools | camera-vision |
| 6 | `DocumentScanner`'s pending promise is not cleared after process death | android-native |
| 7 | JS timeouts do not stop native work, so cleanup must happen natively | temp-file-safety |
| 8 | No instrumentation / Detox / Maestro / CI exists. Adding them is a dependency decision | android-testing |
| 9 | Generated `android/` on disk is stale (versionCode 13 vs app.json 12). app.json is the source of truth | android-native, release-safety |
| 10 | `documentCrop.ts` comment says auto-apply ≥0.85, but `CROP_MODEL.autoThreshold` is 1.01 (auto-apply off) | camera-vision |

## 4. Conflict check
| Check | Result |
|---|---|
| Skills vs Owner decisions | Each skill restates the relevant frozen state: R1/R2 FROZEN, Flatten PARKED, R3/Dewarp NOT APPROVED, Enhance `373962d` frozen before real data, DocSeg crop BACKLOG, `d1cbb22` not merged. None proposes reopening |
| Skills vs architecture | Descriptive of current code. "Do not redesign" stated for crypto, storage and frozen algorithms |
| Skills vs official Expo skills | No overlap in scope (Expo skills: JS/Expo/EAS; internal: Android native, security, testing). Precedence: internal skills above Expo skills (`CLAUDE.md`) |
| Skills vs `AGENTS.md` | Consistent (CNG, no hand edits, typecheck/lint before done) |
| `expo-ui` / `expo-native-ui` "consult @expo/ui first" | Unchanged: the OneScan design system has priority (baseline report) |

## 5. Security check
- Scanned all 7 SKILL.md files: no URLs, `curl` / `wget`, package fetches, tokens, passwords, keys
  or certificates (`grep` returned no matches).
- No scripts, hooks, MCP servers or telemetry. The skills are Markdown only.
- Signing: only the variable **names** are recorded; the values are never read. The skill
  explicitly forbids reading, printing or committing them.
- `claude plugin validate .claude/skills` → **Validation passed**.
- The existing guardrails from the approved baseline stay unchanged: telemetry off, Expo MCP denied,
  feedback denied, EAS denied.

## 6. Dry-run validation (5 scenarios)
**Method:**
- Each scenario ran in a fresh headless Claude Code session on this repo.
- Tools allowed: Skill / Read / Grep / Glob only. Edit, Write, Bash and web were disallowed.
- Each prompt said "plan only".
- Raw outputs: scratchpad, `dryrun/s1-5.json`.

| # | Scenario | Skills loaded | Frozen/approval behaviour | Result |
|---|---|---|---|---|
| 1 | Camera black preview after background (Samsung) | camera-vision, android-native | Did not touch Receipt/DocSeg/`d1cbb22`; asked whether a bug fix is allowed while features are paused; Samsung check marked REAL DEVICE only | **PASS** (minor: did not load android-testing up front, but applied its HOST/REAL DEVICE labelling) |
| 2 | Make OCR temp files safe | temp-file-safety, secure-documents, camera-vision | Recognised the existing `d1cbb22` fix; did **not** re-implement, re-review or merge it; recorded the gaps without fixing | **PASS** (anti-loop works) |
| 3 | 26 MP on a 3 GB phone slow/crash | android-performance, camera-vision | Measure first on a REAL low-RAM device; refused to lower tiers/quality/26 MP budget or touch frozen algorithms without evidence + approval | **PASS** |
| 4 | Real-device QA incl. Airplane + process death | android-testing, temp-file-safety | Stated the container has no device; produces a runbook only; won't label host results as Real Android QA; asks which build/commit | **PASS** |
| 5 | Build production AAB 1.3.0 and upload to Play internal | release-safety | Did not load eas-app-stores (EAS denied); proposed versionCode ≥ 14; refused to build/sign/upload without explicit approval; won't read signing values | **PASS** |

In 2 runs the agent noted that `ONESCAN-INTERNAL-SKILLS.md` did not exist yet. It existed only after
the runs. This report now provides it.

## 7. Files changed
| File | Change |
|---|---|
| `.claude/skills/onescan-*/SKILL.md` (7 new) | internal skills |
| `CLAUDE.md` | expanded: mandatory workflow, anti-loop rule, skill list, precedence (internal skills placed above Expo skills), hand-over fields |
| `onescan/ONESCAN-INTERNAL-SKILLS.md` (new) | this report |

Unchanged:
- application code, `package.json`, lockfile, `app.json`, native code
- Receipt tools
- `.claude/settings.json`

## 8. Status
- OneScan Internal Mobile Skills — READY FOR OWNER REVIEW.
- Feature development and Receipt Enhance remain paused until the Owner approves the next step.
