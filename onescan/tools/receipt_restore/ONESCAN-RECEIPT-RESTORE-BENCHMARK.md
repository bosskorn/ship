# OneScan Receipt Restore Benchmark — READY FOR OWNER REVIEW

R&D only. Nothing here is wired into the app or merged to production. No model was trained or
fine-tuned; methods, thresholds and the dataset were not changed after the run started.
Branch `claude/receipt-restore-rd`, folder `onescan/tools/receipt_restore/`.

## 1. What was run

| Item | Detail |
| --- | --- |
| Distorted set | **300** synthetic Thai / Thai+English receipts, 16 distortion classes × ~19 (wrinkle light/heavy, fold half/multi, curl, curved edges, long, faded thermal, crease shadow, uneven light, tilted, busy background, small text, Thai, Thai+English, numeric dense). Each case: flat reference + camera-like capture + exact ground truth (all prices, VAT, totals, date, time, receipt no., tax ID, phone, QR payload, Code 128). Generator: `gen_bench.py` |
| Flat control | **32** receipts lying flat (camera perspective only), same generator, `--classes flat` |
| Methods | `persp` = detect + perspective correction (today's OneScan geometry, the "before"); `classical` = persp + illumination/shadow normalisation, natural paper; `classical_crisp` = same, white paper/dark ink; `uvdoc` = UVDoc (pretrained, MIT) on a loose crop + classical tone; `dewarpnet` = DewarpNet (DocUNet family, pretrained, MIT) + classical tone; `uvdoc_rect` = UVDoc applied after perspective (diagnostic) |
| Not run | **DocTr / DocTr++** — licence forbids any use "directed toward commercial advantage" without written permission from the author (`LICENSE_REVIEW.md`). **DocUNet** — no official code/weights exist; DewarpNet represents the family |
| OCR | Tesseract 5.3.4, `tha+eng`, LSTM, the **same traineddata files the app bundles** (byte-identical size), PSM 6 |
| Codes | zxing-cpp (QR, Code 128) |
| Host | 4 vCPU x86, no GPU, no Android device or emulator (no KVM) |

### Run integrity
- 300 / 300 cases, 7 rows each = **2,100 / 2,100 rows**; **0 ERROR, 0 skipped, 0 duplicate rows, 0 missing cases, 0 orphan outputs**. Flat control 32 / 32 × 7 = 224 rows, 0 errors.
- Input files (996: every `cap.jpg`, `ref.png`, `gt.json`) SHA-256 identical before and after all
  processing (`results/input_hashes.txt.gz`) — no original was overwritten.

## 2. Content integrity — 300 distorted receipts

Numbers: **exact %** / count read **ALTERED** (a same-length string differing in one digit, e.g. 1,590.00 → 1,590.80).
Nothing here is generative: no method can draw a different digit. "ALTERED" therefore means *the OCR misread that output*; it is counted against the method that produced the image, as required ("prettier but data changed = FAIL").

| method | CER | WER | Amount | VAT | Date | Time | Receipt No.¹ | Tax ID | Phone | QR | Code128 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flat reference (OCR ceiling) | 0.083 | 0.236 | 99.9% / 0 | 97.7% / 0 | 98.7% / 0 | 100% / 0 | 40.0% / 0 | 100% / 0 | 99.7% / 0 | 100% | 100% |
| persp (before) | 0.260 | 0.571 | 74.4% / 133 | 75.0% / 2 | 75.3% / 2 | 83.7% / 7 | 33.3% / 0 | 75.7% / 12 | 78.0% / 5 | 60.3% | 93.3% |
| classical | 0.191 | 0.517 | 79.9% / 116 | 79.7% / 3 | **86.3%** / 4 | 88.7% / 1 | 40.3% / 0 | **86.7%** / 7 | **89.3%** / 3 | **60.7%** | 96.0% |
| **classical_crisp** | **0.175** | **0.449** | **86.1%** / 107 | **82.7%** / 5 | 85.7% / 3 | **90.7%** / 2 | 39.0% / 1 | 83.3% / 7 | 83.0% / 4 | 56.7% | 95.3% |
| uvdoc | 0.209 | 0.571 | 71.9% / 203 | 75.0% / 5 | 83.7% / 3 | 81.7% / 3 | 47.7% / 0 | 86.7% / 6 | 85.3% / 3 | 53.0% | **97.7%** |
| dewarpnet | 0.275 | 0.754 | 68.9% / 252 | 75.0% / 5 | 82.7% / 7 | 79.3% / 6 | 37.3% / 1 | 82.3% / 9 | 82.0% / 5 | 36.7% | 90.3% |
| uvdoc_rect | 0.339 | 0.746 | 62.7% / 244 | 56.7% / 9 | 63.7% / 21 | 66.7% / 10 | 26.0% / 2 | 74.0% / 12 | 64.7% / 7 | 23.0% | 95.0% |

¹ Receipt No. is capped by OCR, not by the image: the bundled Tesseract reads the letter **R** as `8`, `@` or `RO` even on the flat reference (e.g. `R62-795537` → `862-795537`). This affects real receipts in the app today.

All numbers together (exact / ALTERED / cases with ≥ 1 altered): persp 73.4% / 2.1% / 32.0% · classical 79.6% / 1.8% / 29.7% · **classical_crisp 84.0% / 1.7% / 18.3%** · uvdoc 73.0% / 2.9% / 35.7% · dewarpnet 69.9% / 3.8% / 41.3% · uvdoc_rect 61.7% / 4.0% / 47.0%.

### Verdict per case vs perspective-only (rules fixed before results were read)
FAIL-integrity = a number becomes ALTERED that the "before" image did not misread, or a QR/Code 128 that decodes before no longer decodes. FAIL-readability = ≥ 2 numbers lost or CER worse by > 5 pts.

| method | PASS | FAIL-integrity | FAIL-readability | ERROR | skipped |
|---|---|---|---|---|---|
| classical | 168 | 73 | 59 | 0 | 0 |
| **classical_crisp** | **219** | 60 | 21 | 0 | 0 |
| uvdoc | 107 | 121 | 72 | 0 | 0 |
| dewarpnet | 47 | 161 | 92 | 0 | 0 |
| uvdoc_rect | 34 | 197 | 69 | 0 | 0 |

Against perspective-only: numbers lost / newly ALTERED / cases losing a QR or barcode — classical 401 / 104 / 3 · classical_crisp 340 / 109 / 16 · uvdoc 1,090 / 209 / 36 · dewarpnet 1,299 / 264 / 85 · uvdoc_rect 1,684 / 286 / 124. **No method is integrity-safe on every receipt** — even the best changes what OCR reads on 60 of 300 receipts, so any shipped version needs the runtime gate (§7).

## 3. Flat control — 32 receipts already flat

| method | CER | Amount exact / ALTERED | VAT | Date | QR | Code128 | PASS / FAIL-int / FAIL-read |
|---|---|---|---|---|---|---|---|
| persp (before) | 0.159 | 76.3% / 8 | 71.9% | 93.8% | 96.9% | 93.8% | — |
| classical | 0.131 | 76.7% / 7 | 81.2% | 90.6% | 96.9% | 96.9% | 21 / 3 / 8 |
| **classical_crisp** | **0.110** | **94.3% / 1** | **90.6%** | 90.6% | 96.9% | 96.9% | **29 / 1 / 2** |
| uvdoc | 0.145 | 81.4% / 7 | 81.2% | 84.4% | 100% | 96.9% | 16 / 3 / 13 |
| dewarpnet | 0.194 | 82.2% / 6 | 75.0% | 96.9% | 100% | 93.8% | 5 / 6 / 21 |
| uvdoc_rect | 0.216 | 78.2% / 7 | 75.0% | 71.9% | 84.4% | 96.9% | 5 / 10 / 17 |

Geometry on flat receipts (local distortion vs reference, px): persp 6.22 · classical 6.32 · crisp 6.23 · **uvdoc 8.76 · dewarpnet 15.20 · uvdoc_rect 26.03** — the neural models *add* distortion to receipts that were already flat.

**Does the system know a flat receipt should not be dewarped? No.** UVDoc's own warp estimate (grid deviation) is 0.0102 median on flat vs 0.0112 on distorted receipts; the best possible threshold separates them with only 0.61 balanced accuracy. With the threshold fixed before the run (0.008), the gate applied dewarp to **18 / 32 flat receipts**. A reliable flat/warped detector does not exist in this candidate set.

## 4. Geometry quality — 300 distorted

| method | text-line curvature above flat ref (px)² | edge waviness (px) | background in border | ink stretched > 15% | local distortion LD (px) | residual shading (CoV) |
|---|---|---|---|---|---|---|
| persp | 0.26 | *invalid³* | *invalid³* | 11.3% | 10.97 | 0.081 |
| classical | 0.23 | 0.6 | 0.6% | 11.3% | 10.99 | 0.009 |
| classical_crisp | 0.22 | 0.5 | 0.5% | 11.3% | 10.84 | 0.011 |
| uvdoc | 0.40 | 0.7 | 0.9% | 10.8% | 11.72 | 0.010 |
| dewarpnet | 0.78 | 3.2 | 11.9% | 12.4% | 18.16 | 0.016 |
| uvdoc_rect | 1.05 | 0.8 | 3.1% | **48.2%** | 38.69 | 0.009 |

- **Text lines straighter?** Not measurably by any method. Neural dewarp did not reduce line curvature or local distortion versus plain perspective on this set; UVDoc is slightly worse (+0.7 px LD), DewarpNet clearly worse (+7.2 px).
- **Boundary straighter / warp reduced?** Perspective correction already gives straight output edges; dewarp adds no measurable gain. DewarpNet leaves table background in 11.9% of the border (177 cases).
- **New stretching?** `uvdoc_rect` stretches ink in 48% of pixels (it crops and magnifies) — never usable. Others are at the metric's noise floor (~11%).
- **Shadow:** classical normalisation cuts residual paper shading from 0.081 to 0.009–0.011 (≈ 8×) for every toned method; this is where the readability gain comes from.

² Noise floor ≈ 2 px even on the flat reference (Thai below-line vowels disturb the baseline fit); values are *excess over the reference* and only coarse.
³ Measurement defect, see §9: these two cells for `persp` are confounded by its un-normalised shading.

## 5. Performance (this host, 1 CPU thread per process, same 300 + 32 workload)

| method | init (load + first run, s) | median s / receipt | P95 s | long receipts median s | peak RAM (MB)⁴ | temp storage written | output JPEG median | failures / OOM / crash |
|---|---|---|---|---|---|---|---|---|
| persp | 1.26 | 0.10 | 0.16 | 0.17 | 345 | 0 MB | 429 KB | 0 |
| classical | 1.64 | 0.22 | 0.73 | 0.93 | 1,015 | 0 MB | 507 KB | 0 |
| **classical_crisp** | 1.49 | **0.15** | **0.30** | **0.38** | 622 | 0 MB | 225 KB | 0 |
| uvdoc | 2.18 | 0.57 | 1.37 | 1.57 | 1,063 | 0 MB | 464 KB | 0 |
| dewarpnet | 8.41 | 6.08 | 7.27 | 7.51 | 1,398 | 0 MB | 471 KB | 0 |

⁴ Whole Python process (interpreter + PyTorch + OpenCV ≈ 300–350 MB baseline); for comparison between methods only. A Kotlin/native implementation will be far lower.

Model / APK impact:

| model | params | fp32 | fp16 | int8 (est.) | mobile runtime check |
| --- | --- | --- | --- | --- | --- |
| classical | — | 0 MB (OpenCV-style ops, already in our native code) | | | none needed |
| UVDoc | 8.0 M | 30.5 MB | 15.3 MB | ~7.6 MB | exports to ONNX (opset 17, standard ops only: Conv, PRelu, Pad, Reshape, Slice, Transpose…), max diff vs PyTorch 4e-7, 0.29 s / inference on 1 host thread |
| DewarpNet | 86.9 M | 331.7 MB | 165.8 MB | ~83 MB | impractical for an APK |

**Android device timing, peak RAM, thermal, ANR: NOT MEASURED** — no device or emulator in this environment. Required in R8.

## 6. Failure analysis — 300 distorted (cases; one case can have several types)

| failure type | classical | classical_crisp | uvdoc | dewarpnet | uvdoc_rect |
|---|---|---|---|---|---|
| bad boundary (shared detector)⁵ | 41 | 41 | 41 | 41 | 41 |
| incorrect dewarp / content displaced (LD > 20 px) | 28 | 29 | 36 | 63 | 292 |
| text stretching (> 30% ink) | 24 | 24 | 18 | 23 | 265 |
| shadow remains | 0 | 0 | 0 | 0 | 0 |
| background left in output | 4 | 4 | 7 | 177 | 4 |
| text removed / cropped | 3 | 2 | 15 | 29 | 124 |
| numeric corruption (misread vs before) | 71 | 50 | 101 | 117 | 135 |
| QR / barcode damaged | 3 | 16 | 36 | 85 | 124 |
| long-receipt failure | 15 | 14 | 19 | 19 | 19 |
| performance (> 10 s, host, 1 thread) | 0 | 0 | 0 | 14 | 0 |

⁵ Boundary detection is shared by every method, so its failures sink all of them: crease shadow 9/19 and busy background 7/19 cases miss the receipt by > 40 px (e.g. `152_crease_shadow` loses the store header). Curl shows 14/19, partly a measurement artefact (§9). The harness uses a simple colour detector, **not** the app's DocSeg model — the boundary stage is the single biggest lever and should be benchmarked with DocSeg before anything else.

Findings by type:
- **Long receipts** fail for every method; the neural models compress/skew the lower half (both models resize a 1:4–1:6 receipt to a ~1:1.5 input); `classical_crisp` lightens thin faded digits. Tiled processing was not tried (it would be a new candidate).
- **QR damage**: `classical_crisp` loses 13 QR codes that `classical` keeps (mostly faded/long) — the white-paper levels clip light QR modules.
- **Numeric corruption** is lowest for `classical_crisp` (50 cases) and highest for the neural models.

## 7. Quality gate (simulated with on-device signals only)

Rule: use the restored image only if the phone's own OCR reads at least as many numbers, reads no number differently than on the "before" image, every code that decoded still decodes, and (for dewarp) the model reports a warp. Otherwise fall back.

| policy | numbers exact | ALTERED | QR | Code128 | candidate used |
|---|---|---|---|---|---|
| classical_crisp, fallback classical | 83.2% | 1.7% | 61.0% | 96.0% | 180 / 300 |
| uvdoc (if warp > 0.008), fallback classical | 81.4% | 1.8% | 62.3% | 97.3% | 82 / 300 (and **18 / 32 flat**) |
| ungated classical_crisp | 84.0% | 1.7% | 56.7% | 95.3% | 300 |

The gate restores QR safety for crisp (61.0% vs 56.7%) at almost no reading cost; gated UVDoc never beats gated crisp and misfires on flat receipts.

## 8. Original safety and temporary files

- Every method reads the capture and writes a **new** image; the harness never writes to inputs. All 996 input files hash-identical before/after.
- All runs wrote **0 bytes** to their private temp folders (methods work in memory) and left nothing behind.
- The only leftover plaintext files in this whole session came from two OCR processes **killed mid-run** (Tesseract writes `/tmp/tess_*_input.PNG` and does not clean up when killed). Removed after recording. Lesson for R9: a Cancel in the app must delete the OCR/restore temp files itself — the engine will not.
- In the app (R9, not built): the original capture stays encrypted as today; Restore output would be a new processed file through `DocumentFileStore` (AES-256-GCM), the user can switch back to Original, and failed processing discards its temp files (same pattern as Phase B).

## 9. Known measurement limitations (reported, not fixed — no rerun without approval)

1. **Synthetic data only.** Crumples, folds and shading are simulated (`CAPTURE_PROTOCOL.md` describes the real 300-capture set the Owner needs to collect). Rankings may change on real receipts.
2. **`persp` edge waviness / background-in-border cells are invalid** — the paper mask thresholds raw brightness, so `persp`'s un-normalised shadows look like background. Affects only those two cells; other rows are tone-normalised.
3. **Boundary error for `curl`** is measured against corners that ignore the curl's edge displacement, so "bad boundary" is overstated for that class (OCR, numbers, codes and SSIM are unaffected).
4. **Text-line curvature** has a ~2 px noise floor; treat as coarse.
5. **Receipt No.** is limited by the bundled OCR's `R` → `8` confusion for every method, including the flat reference.
6. **Host timings / RAM are not phone numbers**; DewarpNet/UVDoc ran in PyTorch, not a mobile runtime.

None of these change the ranking: the conclusions rest on OCR, numeric integrity, codes and the flat control, which are unaffected.

## 10. Acceptance checklist

| # | Requirement | Status |
|---|---|---|
| 1 | Geometry better | ❌ no candidate measurably straightens text vs perspective; DewarpNet worse |
| 2 | OCR not worse | ✅ classical / crisp (CER 0.260 → 0.175); ⚠️ UVDoc mixed; ❌ DewarpNet |
| 3 | Numeric integrity | ❌ no method is integrity-safe on every receipt; crisp best (60 / 300 FAIL-integrity); needs the gate |
| 4 | QR / barcode regression | ✅ classical (3 lost); ⚠️ crisp only with gate; ❌ neural |
| 5 | Original not modified | ✅ harness; app path designed, not built |
| 6 | Offline | ✅ all methods run locally, no network calls |
| 7 | No plaintext leak | ⚠️ normal runs clean; killed OCR leaves temp files → Cancel must clean up |
| 8 | No OOM / ANR on QA device | ⏳ not measured (no device) |
| 9 | Long receipt | ❌ all methods |
| 10 | Thai receipt | ✅ crisp: Thai CER 0.255 → 0.103, numbers 76.5% → 91.0% |
| 11 | Licensing | ✅ classical; ⚠️ UVDoc / DewarpNet need data-provenance review; ❌ DocTr/DocTr++ |
| 12 | Owner Before/After on phone | ⏳ Owner |

## 11. Recommendation (for the Owner's decision — nothing started)

**No pretrained dewarp model passes.** UVDoc and DewarpNet do not straighten text measurably, lower number accuracy, damage QR codes, distort receipts that were already flat, and cannot tell flat from warped. Per the directive, R&D stops here.

The best result in the benchmark is the **classical pipeline (`classical_crisp`, gated, fallback `classical`)**: +9.8 points of exact numbers (73.4% → 83.2% gated), CER 0.260 → 0.176, residual shadow ÷ 8, Thai improved most, 0.15 s on one host thread, no model, no licence question. It is shadow/illumination restoration, **not** dewarp — the honest product copy is "ปรับใบเสร็จให้อ่านง่ายขึ้น", not "ทำให้เรียบ".

Options for the Owner:
1. **Classical "Receipt Clean" with the gate** (no dewarp), after a real-receipt check of the 300-capture protocol — smallest risk.
2. **Benchmark the boundary stage with the app's DocSeg** — the shared detector caused 41 / 300 failures for every method; likely the largest gain available.
3. Ask the DocTr / DocTr++ author for written commercial permission, then benchmark them unchanged in this harness.
4. Fine-tune or train a receipt-specific dewarp model (long, narrow receipts are where all pretrained models fail) — Owner decision, not started.

## 12. Evidence (rule-selected, not hand-picked)

`evidence/index.json` lists the selection rule per sheet: each category → the case whose `classical_crisp` CER is the **median** of its class; failures → the worst cases per method. Each sheet: capture (red = detected boundary) | flat reference | persp | classical | classical_crisp | uvdoc | dewarpnet, plus a 1:1 `_detail` crop of the totals block.

| Category | Case | Files (`evidence/`) |
|---|---|---|
| Easy (flat) | 016_flat | `easy__016_flat_full.jpg`, `_detail.jpg` |
| Medium | 112_wrinkle_light | `medium__112_wrinkle_light_*` |
| Hard | 152_crease_shadow | `hard__152_crease_shadow_*` |
| Very crumpled | 097_wrinkle_heavy | `very_crumpled__097_wrinkle_heavy_*` |
| Folded | 163_fold_multi | `folded__163_fold_multi_*` |
| Curled | 164_curl | `curled__164_curl_*` |
| Long receipt | 230_long | `long_receipt__230_long_*` |
| Faded thermal | 295_thermal_faded | `faded_thermal__295_thermal_faded_*` |
| Uneven lighting | 153_uneven_light | `uneven_lighting__153_uneven_light_*` |
| Thai-heavy | 109_thai | `thai-heavy__109_thai_*` |
| Thai + English | 222_thai_english | `thai_plus_english__222_thai_english_*` |
| Numeric dense | 239_numeric_dense | `numeric_dense__239_numeric_dense_*` |
| QR / barcode | 122_tilted | `qr_and_barcode__122_tilted_*` |
| Failure — crisp numbers | 006_long | `failure_classical_crisp_numbers__006_long_*` |
| Failure — UVDoc numbers | 006_long | `failure_uvdoc_numbers__006_long_*` |
| Failure — DewarpNet numbers | 166_long | `failure_dewarpnet_numbers__166_long_*` |
| Failure — QR lost by UVDoc | 002_fold_half | `failure_qr_lost_by_uvdoc__002_fold_half_*` |
| Failure — UVDoc geometry | 207_numeric_dense | `failure_uvdoc_geometry__207_numeric_dense_*` |

Raw data: `results/eval_300.jsonl.gz`, `results/eval_flat_32.jsonl.gz` (every case × method incl. OCR text), `results/geometry_*.jsonl.gz`, `results/perf.jsonl`, `results/tables.md`, `results/analyze.md`, `results/input_hashes.txt.gz`. Scripts: `gen_bench.py`, `methods.py`, `evaluate.py`, `geometry.py`, `perf.py`, `analyze.py`, `report_tables.py`, `evidence.py`. Licences: `LICENSE_REVIEW.md`. Real-capture protocol: `CAPTURE_PROTOCOL.md`.
