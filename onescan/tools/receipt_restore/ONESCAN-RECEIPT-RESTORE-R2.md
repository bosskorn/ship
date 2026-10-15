# OneScan Receipt Restore R2 — READY FOR OWNER DECISION

R&D only. Nothing here is wired into the app or merged to production. No model was trained or
fine-tuned. Thresholds and decision rules were fixed in `analyze_r2.py` / `evidence_r2.py` before the
full results were read. The R1 benchmark (report `d604424`) is frozen and was not edited.
Branch `claude/receipt-restore-rd`, folder `onescan/tools/receipt_restore/`.

> **REAL DEVICE / REAL RECEIPT VALIDATION: BLOCKED — awaiting owner-supplied captures**
>
> Every number below is from the synthetic benchmark on a host machine. No real receipt and no real
> device was used, and none was invented. The ingestion and annotation pipeline for real captures is
> ready (`ingest_real.py`, `annotate.html`, `CAPTURE_PROTOCOL.md`).

## 0. Answer

**The oracle boundary supports Case B (geometry), with Case C as the product path.**

- **Case A is ruled out.** With the true paper boundary (oracle), no available geometry method makes a
  wrinkled, folded or curled receipt flatter than plain perspective correction:
  - UVDoc, DewarpNet and the boundary-only Coons patch are **worse than perspective** on 86–98% of the
    300 receipts.
  - **0%** of receipts close even half the curvature gap to the perfect inverse warp.
  - The perfect inverse warp (from the same photo) reaches 0.034 px line curvature against 0.369 for
    perspective. The photo therefore holds enough information to flatten; the methods cannot recover it.
- **The detector is not what stops flattening.** A better boundary does help *perspective cropping*:
  - With the R1 detector, crease-shadow receipts read 48% of numbers; with the true boundary they read 79%.
  - The R1 detector fails on 47% of crease-shadow and 37% of busy-background receipts.
  - Boundary work is therefore worth doing for crop quality, but it will not make receipts flat.
- **Case C conditions hold.** The frozen classical enhancement (`classical_crisp`) raises exact numbers
  from 73.4% to 84.0% and lowers CER from 0.260 to 0.175 against the unenhanced original.
  - It still erases thin strokes on long, low-resolution receipts (§6–§7).
  - It changes what OCR reads on some receipts, so a shipped version needs the runtime gate from R1.

### Headline (300 synthetic distorted receipts)

| method | boundary | line curvature px ↓ | gap closed (median) ↑ | worse than persp | numbers exact | CER | lost to content damage | QR |
|---|---|---|---|---|---|---|---|---|
| original (no tone) | R1 det | 0.614 | – | – | 73.4% | 0.260 | – | 60.3% |
| persp + classical_crisp (frozen R1 baseline) | R1 det | 0.599 | – | – | **84.0%** | 0.175 | 96 + 23 misread | 56.7% |
| persp | R1 det | 0.600 | – | – | 79.6% | 0.191 | 7 + 3 | 60.7% |
| persp | DocSeg | 0.403 | – | – | 82.6% | 0.308 | 150 + 19 | 60.3% |
| persp | **oracle** | **0.369** | 0 (reference) | – | **84.3%** | **0.129** | 4 + 0 | 62.7% |
| UVDoc | oracle | 0.550 | −0.29 | 86.3% | 74.4% | 0.179 | 334 + 49 | 56.3% |
| DewarpNet | oracle | 0.632 | −0.44 | 97.7% | 71.3% | 0.250 | 631 + 118 | 33.3% |
| Coons patch (boundary-only) | oracle | 0.503 | −0.35 | 97.7% | 82.7% | 0.147 | 116 + 31 | 32.3% |
| perfect inverse warp (ceiling) | oracle | **0.034** | 1 (by definition) | – | 80.3% | 0.143 | 3 + 1 | **98.3%** |

The UVDoc, DewarpNet and Coons rows have *no* receipt (0 of 300) where they close at least half the
gap. All geometry rows use the same natural tone, so only geometry and boundary differ (§7).

## 1. What was run, and integrity

| Item | Detail |
|---|---|
| Distorted set | The frozen R1 set: 300 synthetic Thai / Thai+English receipts in 16 classes (seed 7) |
| Flat control | 32 flat receipts (seed 99) |
| Ground-truth extras | Exact paper corners and boundary, printed-line boxes, QR and barcode boxes, and the dense photo→flat map (float32, ¼ resolution). Written by `gen_bench.py --extras` without consuming the generator's random stream, so every image is byte-identical to R1 |
| Boundary sources | **det** = R1 shared detector. **DocSeg** = the app's own `CaptureEngine.detect(uri, 'receipt')`, run on the host through jest with the shipped `docseg.bin`. When the app would open the crop editor (`manual`), the editor's suggested corners are used. **oracle** = the true corners |
| Geometry | perspective, UVDoc (MIT), DewarpNet (MIT), Coons patch from the true boundary (diagnostic), perfect inverse warp from the true map (ceiling) |
| OCR / codes | Tesseract 5.3.4 `tha+eng`, the app's traineddata files, `--psm 6 --oem 1`; zxing-cpp |
| Not run | DocTr / DocTr++ (licence). No training, no fine-tuning, no generative model |

**Integrity checks:**
- **Distorted set:** 300 / 300 cases × 17 rows = **5,100 / 5,100 rows, 0 errors**. That is 3 boundary rows (det, DocSeg suggestion, DocSeg shipped quad), 1 reference OCR row and 13 method rows.
- **Flat control:** 32 / 32 × 17 = **544 / 544 rows, 0 errors**.
- **DocSeg:** 300 + 32 rows. Decisions were review 244 / manual 56 on the distorted set and review 27 / manual 5 on the flat set.
- **Long-receipt track:** 38 / 38 rows (19 long + 19 controls), 0 errors; see §6.
- **Input hashes:** all 996 input files (`cap.jpg`, `ref.png`, `gt.json`) match `results/input_hashes.txt.gz`. No original was changed.

**One infrastructure fix during the run** (no change to any measurement):
- The first long-track run computed its results but crashed while saving the first row (numpy `float32` is not JSON-serialisable), so it wrote no rows.
- The fix only changes how rows are saved: `json.dumps(r, default=float)` in `long_track.py`.
- The track was then run once in full, with the same code path and settings.
- No other component was re-run.

## 2. Boundary — R1 detector vs the app's DocSeg (vs the true paper)

Rules: failure = corner error > 3% of the image diagonal (the app's own crop criterion); false
boundary = IoU < 0.5; clip = > 5% of a printed line outside the quad (header = first 3 lines,
footer = last 3 lines + QR + barcode, side = the rest).

| source | set | corner err median / p90 px | IoU | failure | false boundary | header clip | footer/QR clip | side clip | app opens editor |
|---|---|---|---|---|---|---|---|---|---|
| R1 det | all 300 | **9** / 46 | **0.957** | **8.7%** | 2.3% | 5.7% | 4.7% | 6.3% | – |
| R1 det | crease shadow | 12 / 1182 | 0.767 | **47.4%** | 26.3% | 31.6% | 31.6% | 36.8% | – |
| R1 det | busy background | 10 / 463 | 0.910 | **36.8%** | 5.3% | 15.8% | 10.5% | 21.1% | – |
| R1 det | curl | 7 / 10 | 0.986 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | – |
| R1 det | long | 11 / 32 | 0.958 | 5.3% | 0.0% | 10.5% | 5.3% | 5.3% | – |
| DocSeg (suggestion) | all 300 | 71 / 98 | 0.892 | 12.0% | **0.3%** | **0.3%** | **0.3%** | **0.0%** | 18.7% |
| DocSeg | crease shadow | 77 / 86 | 0.883 | **5.3%** | 0.0% | 0.0% | 0.0% | 0.0% | 26.3% |
| DocSeg | busy background | 76 / 105 | 0.879 | 21.1% | 0.0% | 0.0% | 0.0% | 0.0% | 26.3% |
| DocSeg | curl | 70 / 99 | 0.880 | 21.1% | 0.0% | 0.0% | 0.0% | 0.0% | 15.8% |
| DocSeg | long | 94 / 145 | 0.793 | 15.8% | 5.3% | 5.3% | 5.3% | 0.0% | 21.1% |
| DocSeg (shipped quad, no editor) | all 300 | 73 / 721 | 0.791 | 25.7% | 18.3% | 0.3% | 0.0% | 0.0% | 18.7% |
| R1 det | flat 32 | 7 / 14 | 0.969 | 9.4% | 0.0% | 9.4% | 3.1% | 9.4% | – |
| DocSeg | flat 32 | 70 / 86 | 0.905 | 9.4% | 0.0% | 0.0% | 0.0% | 0.0% | 15.6% |

How to read it:
- **R1 detector: tight but brittle.** It has small corner error when it works, but it fails badly on
  shadows and busy backgrounds and then cuts off header, footer or QR lines.
- **DocSeg: loose but safe.** Its quads sit about 70 px outside the paper on the 3,000-px-tall frame,
  so corner error is high but almost nothing printed is cut off (0.3%). It hands 18.7% of receipts to
  the crop editor. That 18.7% is where the "shipped quad" row's false boundaries come from; the user
  corrects those in the editor.
- **R1's curl "bad boundary" was mostly a ground-truth artefact.** R1's old corner ground truth sat a
  median 43 px off the true curled paper. Against the true paper, the R1 detector has 0% failures on curl.
- **DocSeg harness limits:** DocSeg ran on a half-resolution copy, with Android's resize approximated
  on the host. Its absolute corner error must be re-checked on a device before the looseness is treated
  as real. Decisions: 0 auto, 244 review, 56 manual. Host time was 3.6 s median per capture (host
  timing, not a device figure).

## 3. Geometry by boundary (does a better boundary make the receipt flatter?)

Geometry metrics are measured against the flat reference along the receipt's own printed lines (§9).

| geometry / boundary | all 300: line curv px | col misalign px | char deform | aspect err | crease shadow: curv · numbers | busy bg: curv · numbers | curl: curv · numbers | long: curv · numbers |
|---|---|---|---|---|---|---|---|---|
| persp / det | 0.600 | 5.10 | 0.091 | 0.064 | 1.432 · 48.0% | 1.489 · 60.3% | 0.283 · 86.6% | 0.384 · 80.6% |
| persp / DocSeg | 0.403 | 11.78 | 0.083 | 0.055 | 0.473 · 83.2% | 0.376 · 83.2% | 0.287 · 90.2% | 0.778 · 72.5% |
| persp / oracle | **0.369** | **2.08** | **0.050** | **0.026** | 0.475 · 78.5% | 0.373 · 80.7% | 0.278 · 88.3% | **0.298 · 87.7%** |
| UVDoc / det | 0.632 | 3.91 | 0.087 | 0.064 | 1.261 · 58.8% | 0.568 · 79.1% | 0.390 · 78.7% | 1.248 · 48.4% |
| UVDoc / DocSeg | 0.586 | 3.01 | 0.075 | 0.055 | 0.535 · 73.5% | 0.500 · 75.9% | 0.432 · 75.4% | 1.473 · 42.0% |
| UVDoc / oracle | 0.550 | 2.38 | 0.069 | 0.026 | 0.528 · 75.2% | 0.470 · 76.4% | 0.394 · 76.6% | 1.305 · 48.3% |
| DewarpNet / det | 0.726 | 4.57 | 0.102 | 0.064 | 1.216 · 57.8% | 0.723 · 77.4% | 0.445 · 79.9% | 1.634 · 36.9% |
| DewarpNet / DocSeg | 0.684 | 3.50 | 0.085 | 0.055 | 0.700 · 72.2% | 0.563 · 72.4% | 0.490 · 84.2% | 1.837 · 45.7% |
| DewarpNet / oracle | 0.632 | 3.00 | 0.078 | 0.026 | 0.639 · 74.8% | 0.507 · 74.9% | 0.426 · 82.1% | 1.583 · 41.3% |
| Coons / oracle | 0.503 | 1.66 | 0.069 | 0.026 | 0.566 · 76.5% | 0.483 · 80.4% | 0.412 · 81.6% | 0.513 · 83.7% |
| perfect warp / oracle | **0.034** | **0.59** | **0.008** | **0.000** | 0.037 · 74.5% | 0.034 · 76.4% | 0.033 · 81.8% | 0.043 · 77.7% |

What the boundary changes, and what it does not:
- **Boundary changes the crop.** Going from det to oracle, perspective-only curvature falls from 0.600
  to 0.369 and crease-shadow numbers rise from 48% to 79%. This is entirely from the detector failures
  in §2. DocSeg already recovers most of it on crease shadow and busy background (83% numbers), at the
  cost of a looser crop: amount column misalign 11.8 px and aspect error 0.055.
- **Boundary does not change flatness.** For every learned or boundary-based method, oracle vs
  det/DocSeg moves curvature by ≤ 0.1 px. They all stay well above the 0.034 that the photo allows.

### Gap closed (per receipt; persp/oracle = 0, perfect warp = 1)

| geometry | boundary | median | p75 | ≥ half the gap | worse than persp |
|---|---|---|---|---|---|
| UVDoc | det | −0.26 | −0.04 | 4.7% | 80.0% |
| UVDoc | DocSeg | −0.36 | −0.12 | 0.0% | 91.0% |
| UVDoc | oracle | −0.29 | −0.09 | **0.0%** | 86.3% |
| DewarpNet | det | −0.40 | −0.16 | 4.0% | 89.7% |
| DewarpNet | DocSeg | −0.52 | −0.25 | 0.0% | 98.3% |
| DewarpNet | oracle | −0.44 | −0.21 | **0.0%** | 97.7% |
| Coons | oracle | −0.35 | −0.22 | **0.0%** | 97.7% |

The 4–5% "≥ half" with det are receipts where the R1 detector failed and UVDoc/DewarpNet's loose crop
recovered the paper. Those gains come from the crop, not from flattening.

**Flat control (32):**
- Perspective with the oracle boundary is already nearly flat (0.038 px, close to the ceiling's 0.033).
- UVDoc (0.283), DewarpNet (0.353) and Coons (0.228) *add* curvature to receipts that were flat.

## 4. Oracle Boundary — conclusion

Given the exact paper outline, can we flatten a crumpled receipt? **Not with any method we have.**

| question | evidence | answer |
|---|---|---|
| Is the information in the photo? | the perfect inverse warp reaches 0.034 px curvature and 98.3% QR from the *same* photos | **yes** |
| Does a perfect boundary let current methods use it? | UVDoc / DewarpNet / Coons with the oracle are worse than perspective on 86–98% of receipts; 0% close half the gap | **no** |
| Is the detector the bottleneck for flattening? | oracle vs det changes their curvature by ≤ 0.1 px | **no** |
| Is the detector a bottleneck for cropping? | R1 det fails 47% on crease shadow and 37% on busy background; oracle lifts crease-shadow numbers 48% → 79% | **yes**, and DocSeg already covers most of it |

→ **Case B.** Stop working on the detector as a route to "flatten". Flattening needs a different
geometry model, which is an Owner decision on a custom dewarp architecture and training. This report
does not start it.

→ **Case C is supported for the product:**
- Perspective + classical enhancement on the app's boundary, labelled as "ปรับใบเสร็จให้อ่านง่าย"
  (make the receipt easier to read), not "flatten".
- It needs the integrity gate from R1, because enhancement also changes what OCR reads on some receipts.

## 5. OCR instability vs content damage

Every number on every receipt (7,574 numbers across 300 receipts) is compared against the Original
(R1 det + perspective, no tone):
- **instability** = the processed line's pixels are at least as faithful to the flat reference as the
  Original's (line NCC ≥ Original − 0.02), yet OCR's answer changed.
- **damage** = the line's pixels became less faithful.

200 numbers are unreadable even on the flat reference (OCR limitation) and are excluded.

| method | kept | recovered | lost — instability | misread — instability | lost — **damage** | misread — **damage** | missed by both |
|---|---|---|---|---|---|---|---|
| persp/det + classical_crisp (frozen) | 5195 | 1127 | 168 | 38 | **96** | **23** | 727 |
| persp/det natural | 5133 | 846 | 327 | 50 | 7 | 3 | 1008 |
| persp/DocSeg | 4874 | 1327 | 400 | 77 | 150 | 19 | 527 |
| persp/oracle | 5074 | 1262 | 378 | 64 | 4 | 0 | 592 |
| UVDoc/oracle | 4465 | 1116 | 586 | 86 | **334** | **49** | 738 |
| DewarpNet/oracle | 4258 | 1097 | 427 | 86 | **631** | **118** | 757 |
| Coons/oracle | 4976 | 1246 | 322 | 75 | 116 | 31 | 608 |
| perfect warp/oracle | 4868 | 1179 | **518** | **130** | 3 | 1 | 675 |

- **OCR instability is large and is not geometry's fault.** With perfect geometry, 518 numbers are lost
  and 130 misread with *no* pixel damage. This is Tesseract reacting to resampling, the same reason the
  ceiling reads 80.3% and not ~99%. OCR must not be used to steer geometry, and per-number OCR
  differences alone cannot prove that an image is worse.
- **Real content damage comes from the learned dewarpers:**
  - UVDoc: 334 lost + 49 misread.
  - DewarpNet: 631 lost + 118 misread.
  - They move or smear glyphs.
- **The frozen crisp tone causes 96 + 23 damage cases, against 7 + 3 for natural tone on the same
  geometry.** Crisp gains more readable numbers overall (+1,127 recovered), but it erases some thin
  strokes. 81 of these 119 damage cases are on the 19 long receipts. This is the R1 integrity risk,
  now measured directly.
- **DocSeg's loose crop causes 150 + 19 damage cases**, mostly from the extra background and aspect
  change on long receipts (126 of the 169 are on the 19 long receipts; §6).

Flat control (32 receipts):
- Damage is near zero for perspective with any boundary (0–5).
- DewarpNet still damages 26–27 numbers and Coons 21.
- Instability is 11–50 per method on receipts that are already flat.

## 6. Long receipts (19 long + 19 normal-length controls, oracle boundary everywhere)

38 / 38 rows (19 long receipts + the next case after each as a normal-length control), 0 errors.
Every variant uses the true corners, so only the factor named in each row changes.

**Numbers exact · CER**

| factor | variant | long (19) | controls (19) |
|---|---|---|---|
| shape | aspect h/w | 4.9 | 2.1 |
| **resolution** | photo px per mm of paper | **6.8** | 10.6 |
| OCR ceiling | flat reference, full resolution | 99.0% · 0.068 | 97.2% · 0.074 |
| resolution only | flat reference resampled to the photo's px/mm | 98.8% · 0.070 | 97.5% · 0.078 |
| resolution + camera | + blur, sensor noise, JPEG | **87.1%** · 0.102 | 93.7% · 0.082 |
| geometry | perspective, oracle boundary, natural tone | **87.7%** · 0.119 | 86.4% · 0.131 |
| geometry | perfect inverse warp, natural tone | 77.7% · 0.154 | 81.9% · 0.164 |
| **tone** | perspective, oracle boundary, **crisp** tone | 78.8% · 0.141 | 85.4% · 0.157 |
| learned dewarp | UVDoc on the whole receipt (squashed to 488×712) | 38.9% · 0.496 | 81.4% · 0.170 |
| learned dewarp | UVDoc, padded to its aspect | 49.4% · 0.365 | 51.8% · 0.335 |
| learned dewarp | UVDoc in overlapping tiles | 30.0% · 0.482 | 31.4% · 0.423 |

**Geometry (line curvature px · local scale dev · LD px)**

| variant | long | controls |
|---|---|---|
| perfect inverse warp | 0.043 · 0.008 · 0.96 | 0.047 · 0.014 · 1.23 |
| perspective, oracle | **0.298 · 0.030 · 3.34** | 0.342 · 0.030 · 2.91 |
| UVDoc squashed | 1.267 · 0.052 · 22.22 | 0.474 · 0.038 · 7.09 |
| UVDoc padded | 0.838 · 0.123 · 57.67 | 0.719 · 0.126 · 25.61 |
| UVDoc tiled | 1.435 · 0.222 · 31.16 (seam jump 2.02 px) | 0.971 · 0.193 · 40.01 (seam jump 1.17 px) |

Findings by factor:

- **Geometry: perspective is already enough for these long receipts, and UVDoc breaks them.**
  - Long receipts in this set are mostly long, not crumpled. Perspective with the true boundary has
    lower curvature (0.298) than on the controls (0.342).
  - UVDoc's output grid has only **0.61 rows per printed line** on a long receipt (1.81 on controls).
    It cannot represent a bend that varies from one line to the next.
  - Squashing, padding and tiling all fail:
    - curvature 0.84–1.44 px
    - numbers 30–49%
    - tiling adds a 2 px seam jump
- **Resolution: lowering resolution alone costs nothing; resolution plus the camera is the OCR ceiling.**
  - A long receipt framed whole gets 6.8 px/mm against 10.6 px/mm for a normal one.
  - Resampling the clean reference to that resolution costs nothing (98.8%).
  - Adding camera blur, noise and JPEG at that resolution drops it to 87.1%, against 93.7% for controls.
  - Perspective + natural tone with the true boundary reaches **87.7%, which equals that camera-limited
    ceiling**. Geometry has no more OCR to win on long receipts; more pixels per millimetre would
    (closer or sectioned capture).
- **Tone enhancement: this is the biggest controllable factor on long receipts.** Crisp vs natural on
  identical geometry loses 8.9 points on long receipts (87.7% → 78.8%) but only 1.0 on controls. See §7.
- **OCR:**
  - The perfect inverse warp reads *less* (77.7%) than perspective (87.7%) despite near-zero
    curvature. This is the ¼-resolution map interpolation blurring thin strokes (§10), which is
    another reason geometry metrics, not OCR, must judge geometry.
  - Boundary matters on long receipts in practice: persp/DocSeg reads 72.5% vs persp/oracle 87.7% (§3),
    because DocSeg's long-receipt quads are the loosest (IoU 0.793, aspect error 0.207).

**Recording note (no re-run):**
- The long-track variant labelled `dense` was meant to be the perfect warp with *crisp* tone.
- After the R2 natural-tone decision, `methods_r2.run` defaults to natural, so that row is an exact
  duplicate of `dense_natural` (identical 77.7% / 81.9%). The "perfect geometry, crisp tone" column
  in `results_r2/tables.md` should therefore be read as natural.
- Perfect geometry with crisp tone was measured only in the 7-case dry run (receipt 006: 6/84 numbers
  crisp vs 46/84 natural).
- The tone effect on long receipts is carried by the perspective crisp/natural pair above, which is
  correctly labelled.
- Per the run rules, this was not re-run.

## 7. Tone: natural vs crisp

| set | metric | persp/det natural | persp/det crisp (frozen) |
|---|---|---|---|
| all 300 | numbers exact | 79.6% | **84.0%** |
| all 300 | CER | 0.191 | **0.175** |
| all 300 | numbers lost to pixel damage (lost + misread) | **7 + 3** | 96 + 23 |
| crease shadow | numbers exact | 48.0% | **57.5%** |
| long | numbers exact | **80.6%** | 72.2% |
| long | ALTERED numbers | **31** | 73 |
| long | QR decoded | **68.4%** | 42.1% |
| flat 32 | numbers exact | 77.9% | **90.4%** |

- Crisp wins on average, especially on flat, shadowed and faded receipts.
- **On long receipts crisp loses:** fewer numbers, 2.4× more misreads and far fewer QR decodes.
  Long receipts are photographed at lower resolution per millimetre (§6), so their strokes are thin,
  and crisp's levels push them to white.
- This is why the R2 geometry comparisons use natural tone. The decision was made from the 7-case dry
  run before the full results (long receipt 006: 73/84 numbers natural vs 31/84 crisp, same geometry).
- **Product implication:** an enhancement feature should not use one fixed crisp curve. A stroke-width
  or resolution guard (fall back to natural) is required. This is a design note only; it was not
  tested here, because new candidates are out of scope.

## 8. Before / After evidence

`evidence_r2/` contains 15 sheets, each with a full view and a 1:1 detail crop. The rules were fixed
before the results were read:
- **13 class sheets:** for each class, the receipt whose persp/oracle curvature is the class median.
  No receipt was hand-picked.
- **2 failure sheets:**
  - the worst DocSeg corner error (`118_long`)
  - the worst UVDoc-with-oracle curvature (`122_tilted`)

Each full sheet shows:
- The capture, with three boundaries: red = R1 detector, yellow = DocSeg, green = truth.
- The flat reference.
- persp/det, persp/DocSeg, persp/oracle, UVDoc/oracle, Coons/oracle and the perfect warp.

The case list is in `evidence_r2/index.json`. Example: `heavy_wrinkle__161_wrinkle_heavy_*`
- The R1 detector cuts the receipt diagonally; DocSeg and the truth agree.
- With the oracle boundary, UVDoc and Coons still show wavy totals and dashed rules.
- Only the perfect warp makes the lines straight.

## 9. Metric definitions (fixed before results)

All metrics come from one dense flow from the flat reference to the output, with both images
tone-normalised and resized to 576 px width. Lines come from the generator's exact line boxes.

- **line curvature:** per printed line, the residual of vertical flow after a straight-line fit (px);
  mean over lines. This replaces R1's glyph-baseline fit, which had a ~2 px noise floor.
- **line tilt spread:** standard deviation of the per-line slopes.
- **amount column misalign:** detrended standard deviation of the horizontal flow at the right-aligned
  amount column.
- **local scale dev / char deformation:** median |det J − 1| and median singular-value anisotropy of
  the flow Jacobian, on ink.
- **aspect err:** |log(out h/w ÷ ref h/w)|.
- **unmatched ink:** share of reference ink with paper-white output after alignment.
- **line similarity:** per-line NCC, used only to split OCR instability from damage (§5).

## 10. Limitations

- **Synthetic only, host only.** Real-receipt and real-device validation is **BLOCKED — awaiting
  owner-supplied captures**.
- **The DocSeg harness approximates the app:**
  - It ran on a half-resolution source, with Android's bitmap resize mirrored in TypeScript.
  - Pixel conversions were matched: power-of-two sampling with bilinear filtering, and integer BT.601 YCbCr.
  - Corner looseness and decision rates must be re-checked on a device.
- **The "perfect warp" is a ceiling for geometry, not for OCR.** Its map is stored at ¼ resolution
  and interpolated, which adds resampling blur. That is part of why it reads 80.3% and not ~99%.
  Its geometry metrics (0.034 px) are the meaningful part.
- **Coons patch is diagnostic.** It uses the exact boundary curves, which no detector provides today.
- **OCR is Tesseract** with the app's files and settings, on host CPU. ML Kit or on-device OCR may
  rank methods differently.
- **Host timings are not device timings.**

## 11. Separate: SECURITY FIX READY FOR CODE REVIEW

The OCR temp-file lifecycle fix found in R2 is on its own branch and **not merged**:
- Branch: `claude/ocr-temp-cleanup`
- Commit: `d1cbb22`

What it changes:
- `SecureFiles.withPlainTemp` decrypts an encrypted page for OCR into a scoped plain-temp file, which
  is deleted in `finally` on success, failure, interruption or tampered input.
- Plaintext inputs pass through unchanged.
- The plain-cache trimming skips the scoped folder.
- `OneScanVisionModule.recognizeTextAsync` uses this helper.

Tests:
- `PlainTempTest.kt`: 6 / 6 pass (success, failure, interruption, tampered input, plaintext
  pass-through, concurrent calls).
- The full `onescan-vision` module test suite passed.

It needs normal code review before any merge. It is reported here only because it was found during R2.

## 12. Files

| path | content |
|---|---|
| `ONESCAN-RECEIPT-RESTORE-R2.md` | this report |
| `evidence_r2/` | 15 Before/After sheets (full + detail) and `index.json` |
| `results_r2/r2_eval_300.jsonl.gz`, `r2_eval_flat_32.jsonl.gz` | every boundary and method row, including per-line similarity |
| `results_r2/docseg_300.jsonl.gz`, `docseg_flat_32.jsonl.gz` | app CaptureEngine.detect output per capture |
| `results_r2/long_track.jsonl.gz` | long-receipt track rows |
| `results_r2/tables.md` | full `analyze_r2.py` output |
| `gen_bench.py --extras`, `prep_half.py`, `src/__rr__/docseg.rr.ts`, `geom2.py`, `methods_r2.py`, `evaluate_r2.py`, `long_track.py`, `analyze_r2.py`, `evidence_r2.py` | R2 tooling |
| `ingest_real.py`, `annotate.html` | real-receipt ingestion and local corner annotation (ready, unused) |

Not done, as instructed: no training or fine-tuning, no R3, no new candidate, no threshold change, no
re-run to improve scores, no production merge.
