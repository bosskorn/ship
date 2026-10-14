# OneScan — Android test builds

| File | Built from | Notes |
| --- | --- | --- |
| `OneScan-v1.3.0-V3-DevicePreview.apk` | branch `claude/account-1.3` @ 3a55731 | **1.3.0 V3 Device Preview** (versionName 1.3.0-preview, versionCode 13), arm64-v8a, release (R8), **Play upload key**. Owner UX/regression preview only — **not QA1, not Production**; no account servers configured (account off). See `DEVICE-PREVIEW-1.3-V3.md`. |
| `OneScan-v1.2.0-Production.aab` | branch `claude/release-1.2.0` @ 78c0121 (= RC4 b2a175b + versionCode 13) | **1.2.0 Production** (versionCode 13) Android App Bundle for Google Play, signed with the **Play upload key**, R8 (mapping: `OneScan-v1.2.0-Production-mapping.txt.gz`). Not uploaded yet — awaiting Owner approval. See `RELEASE-1.2.0.md`. |
| `OneScan-v1.2.0-RC4-arm64.apk` | branch `claude/onescan-mobile-v1` @ b2a175b | **1.2.0 Final RC (RC4)** (versionCode 12), arm64-v8a, release build (R8) signed with the **Play upload key** — current build for real-device QA (see `QA-CHECKLIST-RC4.md`). Supersedes RC3. Fresh install, or update over RC1–RC3 (same key). Cannot update debug-key builds. |
| `OneScan-v1.2.0-RC3-arm64.apk` | branch `claude/onescan-mobile-v1` @ eae3db8 | **1.2.0 RC3** (versionCode 12), arm64-v8a, release build signed with the **Play upload key** — current build for Visual/Real-device QA (see `QA-CHECKLIST-RC3.md`). Supersedes RC2. Fresh install, or update over RC1/RC2 (same key). Cannot update debug-key builds. |
| `OneScan-v1.2.0-RC2-arm64.apk` | branch `claude/onescan-mobile-v1` @ 64a699e | **1.2.0 RC2** (versionCode 12), arm64-v8a, release build signed with the **Play upload key** — the current build for real-device QA (see `QA-CHECKLIST-RC2.md`). Fresh install, or update over RC1 (same key). Cannot update debug-key builds (1.1.x, RC1-QA). No debug-key copy of RC2 is made. |
| `OneScan-v1.2.0-RC1-arm64.apk` | branch `claude/onescan-mobile-v1` @ 3a66553 | **1.2.0 RC1** (versionCode 11), arm64-v8a, release build signed with the **Play upload key**. Fresh installs. Cannot update earlier test builds (different signing key): uninstall them first, which deletes their documents. |
| `OneScan-v1.2.0-RC1-QA-arm64.apk` | same APK, re-signed | Identical app signed with the **debug key**, so it **installs over 1.1.x** and keeps its documents — use it to test the migration of old documents (encryption + database). For QA only — **use only to test migration from 1.1.x** (migration code is unchanged in RC2). |

## Changes in 1.2.0 RC4 (Final RC, production UI from design V2)
- First launch: three pages (Scan, Find & share, On-device privacy) in one visual style.
- Home is a workspace: recent documents (real thumbnails, page count) and four quick actions; fresh install shows Scan, Import image, Import PDF only.
- Navigation: Home | Documents | Scan (round button) | Tools | Me.
- Documents: grid by default (list option), long-press selection with select all / move / delete, document sheet with thumbnail; Folders and Recent chips; folders start at 0.
- Tools: Scan ID card, Scan receipt, Import image, Import PDF. Me: grouped settings.
- Search shows the matching text from the scan, highlighted.
- Camera (presentation only): "Looking for the document edges…", blue ready state, "Page N added" and tray count, "Enhancing…".
- Review: page as paper, Crop / Adjust / Rotate / Delete page, page strip, "Save document". Viewer: Share / Edit / Text / More.
- Unchanged: camera pipeline, crop ML, OCR, PDF, encryption, SQLCipher, search engine, migration.

## Changes in 1.2.0 RC3 (release candidate, UI)
- New Home: "Every document. Ready in seconds.", one large Scan button, three benefits, a short privacy note, then recent documents or a "Start with your first document" state; shortcuts below.
- New first launch: two pages in the same style, then Home.
- Folders start empty: no automatic folders on a new install (empty automatic folders from older versions are hidden); "No folders yet" with New folder.
- Text: benefit-led copy on onboarding, camera permission, saving and About; the Privacy screen keeps the full explanation.
- Unchanged from RC2: camera, ML, OCR, encryption, database, PDF, migration.

## Changes in 1.2.0 RC2 (release candidate)
- Production feature audit: unfinished features (sign-in, plans, cloud, AI, trash, app lock, redaction, auto capture…) are hidden and their links redirect; no "Coming soon".
- New app icon and logo.
- Languages: English and ไทย (Settings → Language: System default / English / ไทย); missing text falls back to English, never a raw key.
- Settings → Text recognition language (separate from the app language): Automatic (Thai + English) — same OCR as RC1, on the device only.
- Long translated labels wrap instead of being cut off; the back button is announced in the app language.
- Unchanged from RC1: encryption, database and migration, PDF, native camera module, crop/ML models. Scanner screen: only the "Use system scanner" menu item is hidden once pages are captured, and spacing changes for right-to-left readiness.

## Changes in 1.2.0 RC1 (release candidate)
- Your documents are encrypted on the phone: pages, PDFs (AES-256-GCM, key in the Android Keystore) and the database with OCR text and search index (SQLCipher). Documents from earlier versions are encrypted automatically in the background after the first start.
- No Android backup or device-to-device transfer of app data; documents never leave the phone unless you share them (sharing uses a temporary decrypted copy that is removed on the next start).
- Document presence check: when there is no document in the photo nothing is cropped — "No document found / Choose edges".
- Auto crop: new page-segmentation model and crop candidates. Crops are not applied automatically yet (precision below 98%): the app shows the suggested crop with "Use this crop / Adjust edges", or opens the crop editor.
- Camera: busy / disabled / black preview is detected, with "Try again" and "Use Google Scanner"; the camera pauses behind other screens; permission granted in Settings is picked up.
- Saving never fails because of OCR (a page whose OCR fails is saved without text); OCR models install safely.
- Up to 20 pages per document. Low storage is checked before capture and save, with clear messages.
- Red stamps and coloured ink keep their colour in the scan filter.
- Unfinished items (sign-in, plans, cloud, AI, etc.) are hidden in this version. Scan diagnostics: About → tap the version 7 times.

## Changes in 1.1.2 (auto crop hotfix, interim)
- Automatic crop no longer takes "the biggest region": outlines are scored on text, paper, edges, segmentation and background; grout/tile lines and floors lose.
- Confident crops are applied; less confident ones show "Adjust edges"; unsure ones open the crop editor with suggested corners.
- Crops never clip text at the edges (up to 2% margin added).
- Improved page-segmentation weights.
- Settings → Scan diagnostics shows why a crop was chosen (candidates, scores, confidence).
- Measured on held-out photos: ~2.5× more crops right than 1.1.1, but not yet at the 95% target.

## Changes in 1.1.1 (pre device-QA fixes)
- Cancelling the system scanner returns to the OneScan camera.
- HD ↔ MAX no longer restarts the camera when both give the same sensor size; camera originals are JPEG 97.
- Very large photos (48/64 MP) are rendered at ~26 MP to stay within memory.
- Settings → Scan quality: "Try the OneScan camera again" after an automatic fallback.
- Scan diagnostics → "Copy report" for the QA sheet.

## Changes in 1.1.0 (Scanner Phase 1)
- Scan opens the new OneScan camera (the Google/system scanner is now the fallback). Settings → Scan quality → Scanner engine: Automatic (default) / OneScan camera / System scanner.
- Real full-resolution photos with HD / MAX in the top bar (HD ≈ 12 MP JPEG 95, MAX = largest the camera offers up to ~26 MP, JPEG 97). Card mode uses MAX.
- Manual capture; auto capture is turned off in this build (coming after device QA).
- Modes: Auto, Document, Card, Receipt. Single page by default; tap "Multi-page" next to the shutter for more pages, then "Done".
- Captured page appears immediately; enhancement runs in the background.
- One coaching message at a time, live corners, scan line, haptics. Diagnostics show camera capture size, HD/MAX, JPEG quality and timings.

## Changes in 1.0.6
- ID cards (Home → Scan ID card) are saved as enhanced colour scans: white balance, even lighting, softer shadows, sharper text; the photo and card colours are kept. New "Card" filter in the editor.

## Changes in 1.0.5
- Full-resolution scans: the scanner's original is kept, the saved page is rendered once at full resolution (JPEG 95), PDFs embed it unchanged. Previously pages were shrunk to 2480 px at JPEG 88.
- Tap a page in a document to zoom (pinch / double-tap) on the full-resolution image.
- Settings → Scan quality (Standard / High / Maximum) and Scan diagnostics.
- Filters and crops are re-applied to the original, so changing them never loses quality.

## Changes in 1.0.4
- New default "Scan" filter: white paper (shadows and lamp tint removed), dark crisp text, colour kept for stamps, logos and ID photos. Other filters (Original, Document, Color, Gray, B&W) are unchanged in the editor.

## Changes in 1.0.3
- Scan now opens Google's ML Kit Document Scanner (on device, via Google Play services): reliable edge detection, auto capture and crop for documents, ID cards, passports and receipts; multi-page; import from gallery with auto crop.
- Scanned pages go through OneScan's own enhance → OCR (Thai + English) → PDF → search pipeline. Nothing is uploaded.
- Phones without Google Play services fall back to the in-app camera.

## Changes in 1.0.2
- Pages are detected by tint as well as brightness (camera Cb/Cr): white paper on a light floor under room lighting.
- Fixed: pages whose left/right edges lean opposite ways (perspective) were never outlined.

## Changes in 1.0.1
- New document edge detector (edge-driven): no more borders that merge an object with the floor/shadow or follow objects cut off by the frame.
- Border is shown only when auto-capture would accept it; overlay is clipped to the camera area.
- Auto capture after ~1 s of holding steady.

Install: download the APK on an Android phone (Android 7+ / arm64), allow "Install unknown apps" for the browser, open the file.
Checksums: see `SHA256SUMS`. Previous builds remain in this branch's history.
