---
name: onescan-camera-vision
description: OneScan camera capture and image pipeline - CameraX view, ML Kit scanner fallback, live detection/auto-capture, EXIF/orientation, DocSeg crop and ranker, perspective warp, filters (scan look, card look), resolution tiers, Tesseract/ML Kit OCR, PDF raster/write, QR/barcode preservation. Use when a task touches src/core/document-engine/capture|image|ocr|pdf, src/features/scanner, or the matching Kotlin. Receipt Restore R1/R2 are FROZEN and R3 is NOT APPROVED.
---

# OneScan — camera and vision pipeline

Paths below are relative to `onescan/`. `K/` means
`modules/onescan-vision/android/src/main/java/app/onescan/vision/`.

## Workflow (mandatory)
READ BASELINE → LOCATE current code (map below) → CHECK FROZEN → MINIMAL CHANGE → IMPLEMENT →
TEST → REPORT → STOP.

## Frozen / out of scope (anti-loop)
- **Receipt Restore R1 and R2 are FROZEN** (`tools/receipt_restore/`, report `219d858`).
  - Host-only Python; not wired into the app.
  - Do not edit its algorithms, thresholds or datasets.
  - Do not re-run its benchmarks.
- **Receipt Flatten is PARKED. R3 and Custom Dewarp are NOT APPROVED.** No training or fine-tuning.
- **Receipt Enhance:** validation tooling `373962d` is FROZEN BEFORE REAL DATA (Pilot of 30 real
  receipts). Do not implement it in the app or tune its policy without an Owner decision.
- **DocSeg Receipt Crop is BACKLOG.** DocSeg weights, `CROP_MODEL` and calibration are shipped
  results; do not retrain or re-tune them.

## Pipeline map
1. **Engine choice** (`src/features/scanner/engine.ts` `chooseEngine`):
   - Default is OneScan CameraX.
   - Falls back to the ML Kit Document Scanner after 2 start failures in 7 days, when disabled by
     flag, or when the module is missing.
   - Last resort is expo-camera `CameraView`.
2. **Camera** (`K/OneScanCameraView.kt`):
   - Preview + ImageCapture (`MAXIMIZE_QUALITY`, 4:3, caps 12.6 MP "hd" / 26 MP "max", JPEG 97)
     + ImageAnalysis (KEEP_ONLY_LATEST, about 640×480).
   - Frames are downsampled to `frameMaxEdge`. The scanner uses 192 px every 250 ms.
   - Each frame yields a 64×64 DocSeg mask, or the raw planes when DocSeg is unavailable.
   - Captures are written to `cacheDir/onescan/capture-*.jpg`.
3. **Live detection:**
   - `useLiveDetection.ts` → `CaptureEngine.detectFrame` → `docSeg.maskToQuad`, or the classical
     `quadDetector.detectQuad` → `AutoCaptureController` (stable 4 frames, cooldown 1.5 s).
   - `auto_capture_enabled` is OFF in production.
4. **Post-capture crop** (`CaptureEngine.detect`):
   - grayscale at 384 px → presence gate → DocSeg (+ zoom pass at 256 px) → `documentCrop`
     candidates ranked by `CROP_MODEL` → `textSafeQuad` → `decisionFor`.
   - **`autoThreshold` is 1.01**, so auto-apply is off and every crop is review or manual.
   - The ≥0.85 in the `documentCrop.ts` comment is stale.
5. **Orientation** (`K/ImageIO.kt`):
   - `exifRotation` → `loadUpright` / `decodeForOutput` rotate the pixels.
   - Outputs are written **without EXIF**, already upright.
   - The untouched original JPEG is reused only when orientation is 0.
6. **Warp + filter** (`K/PageProcessor.kt`):
   - `warp` uses `setPolyToPoly` on the quad.
   - Filters: original | auto = `scanLook` | card = `CardLook` | document | color | gray | bw.
   - OOM handling: retries at 2480 px with `degraded=true`.
7. **Resolution tiers** (`image/quality.ts`, mirrored in Kotlin):

   | Tier | maxEdge | JPEG quality |
   |---|---|---|
   | master `standard` | 2200 | 88 |
   | master `high` (default) | 4000 | 95 |
   | master `maximum` | source | 97 |
   | preview | 1600 | 85 |
   | thumbnail | 400 | 80 |

   Slack is 1.15 and the pixel budget is 26 MP. Keep the JS and Kotlin copies identical.
8. **OCR** (`K/TextRecognizer.kt`):
   - Works on a 2480 px upright copy.
   - `th*` → Tesseract `tha+eng` (PSM_AUTO, line boxes, under a lock); otherwise ML Kit Latin.
   - Traineddata comes from `assets/tessdata`.
   - JS side: `OCREngine.ts`, 60 s per page; `ocrLanguages.ts`.
9. **PDF:**
   - `PdfWriter` streams page JPEGs unchanged (no re-encode).
   - `PdfRasterizer` renders one page at a time.
   - `PdfPrinter` streams decrypted bytes to the spooler.

## Rules
- **Image quality is a product decision.** Do not lower resolution, JPEG quality or tiers, or change
  filters, to win performance without measured evidence and Owner approval.
- **Orientation:** any new output must be pixel-upright, or must carry correct EXIF. Test the
  0/90/180/270 sources.
- **Crop:** never auto-apply a crop the ranker marks review or manual. Keep `suggestion` for the
  editor.
- **QR / barcode:**
  - The app does **not** decode or verify codes today.
  - Any filter, resize or recompression change must show that codes still decode. Use the host
    zxing check from `tools/receipt_restore` style tooling on before/after images, as evidence only.
  - Never add a cloud decoder.
- **Bitmaps:**
  - Decode with bounds + `inSampleSize`.
  - `recycle()` every intermediate in `finally`.
  - Respect the 26 MP budget (see `onescan-android-performance`).
- **Files:** every native output is a **plaintext** file in `cacheDir/onescan`. Load
  `onescan-secure-documents` + `onescan-temp-file-safety` when you add or change an output.
- **Parity:** DocSeg has Kotlin, Swift and TS twins (`docSeg.ts`, parity test `docseg_parity.bin`).
  Change all of them or none.

## Tests to run (HOST)
- `npx jest src/__tests__/{autoCapture,autoCrop,docSeg,quadDetector,imageQuality,scannerPhase1,documentEngine,imageExport,pageToolsEngine}.test.ts`
- Kotlin: `PageProcessorTest`, `DocSegTest`, `FrameStatsTest`, `ColourInkTest`, `PdfWriterTest`,
  `PdfRasterizerTest`.
- Camera behaviour, real optics and lighting: **REAL DEVICE only** (see `onescan-android-testing`).
