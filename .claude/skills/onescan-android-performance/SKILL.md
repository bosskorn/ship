---
name: onescan-android-performance
description: Measuring and improving OneScan Android performance with evidence - RAM (Java/native/bitmap/JS), processing latency P50/P95, OOM, ANR, startup, long documents (up to the page cap), large images (26 MP budget), thermal/battery observation. Use for any perf task, any memory or OOM/ANR report, and before claiming a change is faster or lighter. Never trades document quality or frozen algorithms for speed without evidence and Owner approval.
---

# OneScan — Android performance

## Workflow (mandatory)
READ BASELINE → LOCATE the hot path → **MEASURE FIRST (baseline numbers)** → MINIMAL CHANGE → MEASURE
AGAIN on the same device and input → REPORT both → STOP.

No measurement means no optimisation claim.

## Hard rules
- Do not lower master resolution, JPEG quality or tiers, change filters, or change frozen
  algorithms (DocSeg, crop ranker, Receipt R1/R2) to gain speed or memory, unless you have
  evidence **and** Owner approval.
- Do not add dependencies (profilers, libraries) to the app.
- Host timings are **not** device timings. Label every number HOST / EMULATOR / REAL DEVICE plus
  the device model, Android version and RAM.

## Known budgets and mechanisms (current code)
- **Pixels:**
  - `MAX_OUTPUT_PIXELS = 26 MP`; capture caps 12.6 MP ("hd") and 26 MP ("max").
  - Master tiers 2200 / 4000 / source with slack 1.15 (`image/quality.ts` and Kotlin).
  - OCR and fallback edge: 2480 px.
- **Bitmaps:**
  - ARGB_8888, so 26 MP ≈ 104 MB per bitmap. Warp and filter may hold 2–3 at once.
  - `largeHeap=true` in the module manifest.
  - The only OOM handling is `PageProcessor.process` → `System.gc()` → retry at 2480 px with
    `degraded=true`.
  - No `inBitmap` reuse.
- **PDF:**
  - `PdfWriter` streams JPEG bytes with no decode.
  - `PdfRasterizer` renders one page at a time and recycles.
  - Page window / count paging exists.
- **Camera:**
  - Analysis frames are byte arrays at 192 px every 250 ms, KEEP_ONLY_LATEST, on a single-thread
    executor.
  - DocSeg runs per frame (128 px in, 64 px mask).
- **OCR:**
  - Tesseract is serialized by a lock, so pages run one after another.
  - JS timeout of 60 s per page. The native work continues after a timeout.
- **Native threading:**
  - AsyncFunctions run on Expo's async queue; `printPdfAsync` runs on MAIN.
  - Anything slow on MAIN is an ANR risk.
- **Long documents:** `MAX_SCAN_PAGES` cap (`productionGuards.test.ts`); page-by-page processing
  (Phase B).
- **Disk:** `MIN_FREE_BYTES_SAVE` 250 MB, `MIN_FREE_BYTES_CAPTURE` 100 MB (`storage/diskSpace.ts`).

## How to measure (REAL DEVICE; Owner runs or approves the device)
| What | How |
|---|---|
| Latency P50/P95 | Scan Diagnostics timings (dev builds only: `devTools` is off in release), or timing logs added only in a dev branch. ≥ 3 runs × N pages; report median and P95 |
| Memory | `adb shell dumpsys meminfo app.onescan.mobile`: Java heap, Native heap, Graphics, TOTAL PSS peak during the operation |
| OOM | `adb logcat \| grep -E "OutOfMemoryError\|lowmemorykiller"`; check `degraded=true` in results |
| ANR | `adb shell dumpsys activity anr`; `adb bugreport` → `/data/anr` |
| Startup | `adb shell am start -W -n app.onescan.mobile/.MainActivity` (TotalTime), cold and warm |
| Thermal / battery | `dumpsys thermalservice`, `dumpsys battery` before and after a fixed workload — observation only |
| JS | Hermes profiler in a dev build only; never ship profiling code |

## Test inputs
Use the same fixed inputs for before and after:
- a 26 MP capture
- a 12 MP capture
- a long receipt (aspect ≥ 3)
- a 50-page PDF
- a MAX_SCAN_PAGES document

Use a low-end device (≤ 4 GB RAM) for every memory claim.

## Report format
For each measure, give the before and after values plus device, build type (release with R8 for
final numbers), input set and run count.

State the residual risk: which input or device was not tested.
