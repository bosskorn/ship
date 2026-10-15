# OneScan Receipt Enhance — Real Receipt Validation Package

**Status: WAITING FOR OWNER REAL RECEIPTS**

**Product track:** Receipt Enhance / ปรับใบเสร็จให้อ่านง่าย (Owner decision on R2, commit `219d858`)

**Scope of this package:**
- It does not change the app and does not merge anything.
- It is used to test the enhancement candidate on real receipts before anyone decides on production.

**What this feature does:**
- reduces shadows
- evens out the paper
- raises contrast
- makes text easier to read
- keeps the numbers, QR codes, barcodes and the original capture unchanged

**What this feature does not claim:**
- flattening crumpled receipts
- restoring the original
- "Restore 100%"

## 1. The candidate under test (frozen before any real data is seen)

| Item | Value |
|---|---|
| Pipeline | perspective (crop the user confirms) → classical enhancement → tone chosen by a rule |
| Normal receipt | `crisp` (the frozen R1 classical_crisp) |
| Long receipt | `natural` |
| Not sure / no usable crop | `natural` (safe fallback) |
| Long-receipt rule | `enhance_policy.py` (`enhance-policy-1`): deterministic, uses only the crop's geometry. No AI classifier |

The rule, in order:
1. The crop is unusable → natural.
2. Long side / short side ≥ 3.0 → **long** → natural.
3. Paper width < 8.5 px/mm (assuming 80 mm paper) → thin strokes → natural.
4. Aspect 2.6–3.0 or 8.5–9.5 px/mm → not sure → natural.
5. Otherwise → crisp.

**Where the thresholds come from:**
- They come from the frozen synthetic set (R2):
  - long receipts: aspect 3.87–6.12, about 7 px/mm
  - normal receipts: aspect 1.52–3.67, about 10.6 px/mm
- They were fixed in `enhance_policy.py` before any real receipt was seen.
- **They must not be adjusted after seeing results.**

Unit tests: `python3 -m unittest test_enhance_policy -v` (10/10 pass). They cover:
- every threshold boundary
- sideways and rotated receipts
- an unusable crop falling back to natural
- deterministic output
- `enhance()` never modifying the original image

## 2. What the Owner needs to prepare (Owner checklist)

### 2.1 Quantity and coverage (minimums in `gate.py`; Owner can change them before the run)

| Item | Minimum |
|---|---|
| Distinct real receipts | **60** |
| Captures per condition | **10 each**: FL normal · L1 long · T1 faded thermal · W1/W2 wrinkled · F1/F2 folded · S1 crease shadow · S2 uneven light · B1 busy background · X1 small numbers |
| Thai-only receipts | 20 |
| Thai + English receipts | 20 |
| Receipts with a QR code | 10 |
| Receipts with a barcode (any type) | 10 |
| Every receipt | type in the truth values for **VAT, total, date** and every other number on the receipt |
| Devices | at least 3 Android phones (low-end ≤ 4 GB RAM / mid-range / recent) |

**Code `FL` = normal:** a normal-length receipt, photographed normally. The other condition codes and
how to stage them are in `../CAPTURE_PROTOCOL.md`.

### 2.2 Steps for each receipt

1. Create a folder per receipt **outside the repo**, e.g. `~/onescan-real/R001/`.
2. Make `ref.png`: scan the flat receipt (flatbed at 300 dpi), or photograph it under glass in even light.
3. Make a gt.json draft with `python3 draft_gt.py ~/onescan-real/R001`. It reads lines with local OCR
   and decodes the QR / barcode locally.
4. **Check gt.json by hand:**
   - Correct every line against the real paper receipt.
   - Type every number into `fields`, exactly as printed (empty string if the receipt has none).
   - Set `english`, `small_numbers` and `device`.
   - Set **`"reviewed": true`**.
5. Photograph the distorted receipt, one image per condition, named `<CODE>.jpg` (`FL.jpg`, `L1.jpg`, `W2.jpg` …).
   - Use the phone's camera at **full resolution**, with no "scan document" or beauty mode.
   - The current app has no "keep original" setting (the setting mentioned in CAPTURE_PROTOCOL does
     not exist), so use the phone camera for now.
6. Open `../annotate.html` (it opens locally from a file; nothing is uploaded).
   - Click the 4 corners of the receipt in each image.
   - Save it as `<CODE>.corners.json` next to the image.
   - This stands for the crop the user confirms in the app.
7. Black out personal data (names, card numbers, member IDs) in `redactions.json`, or use receipts that don't have any.

### 2.3 Running it (local only)

```bash
cd onescan/tools/receipt_restore/enhance_validation
python3 check_dataset.py ~/onescan-real ~/onescan-real-ingested     # check completeness, then ingest
python3 run_real_validation.py ~/onescan-real-ingested ~/onescan-real-results --workers 4
```

Outputs:
- `results.jsonl`: every row, including OCR text.
- `summary.md`: coverage, results by condition, number changes Original → Enhanced, tone decisions, and the product gate.
- `review/index.html` + images: Before/After. Copy the folder to a phone over USB and open it there, with no network.

## 3. What is measured

| Measure | How |
|---|---|
| Readability | numbers read exactly (per field kind), CER, and Thai-only CER when lines are given |
| Numeric integrity | every number, Original → Enhanced: kept / recovered / lost / **newly ALTERED** (one digit changed); key fields (total, VAT, pre-VAT, date, time, tax ID) reported separately |
| QR / barcode | decoded and equal to the truth payload, on both Original and Enhanced; counts receipts that decode before but not after |
| Long receipts | the share of L1 receipts that get natural, and natural vs crisp on the same crop (diagnostic only) |
| Original safety | SHA-256 of every capture before and after the run must match |
| Time | measured on the host only (not a device figure); device numbers come from §5 |

**Boundary used:** the annotated corners. These stand for the crop the user confirms in the editor,
so boundary errors do not mix into the enhancement results. DocSeg / cropping is a separate
workstream (BACKLOG).

## 4. Product gate (PROPOSED — Owner confirms before the real data is run)

Defined in `gate.py` (`enhance-gate-1`). **Owner should confirm or change these values before the run;
after that they are frozen.**

| # | Gate | Proposed criterion | Measured where |
|---|---|---|---|
| 1 | Readability improves | numbers exact +3.0 pts overall; no condition worse than −2.0 pts; CER not worse | host |
| 2 | Numeric integrity | 0 newly ALTERED in total / VAT / pre-VAT / date / time / tax ID; all numbers ≤ 0.5%; lost ≤ recovered | host |
| 3 | Long receipts natural | every L1 gets natural; Enhanced ≥ Original; 0 newly ALTERED key fields | host |
| 4 | QR / barcode | 0 receipts that decode on Original but not on Enhanced | host |
| 5 | Original not modified | SHA-256 matches for every capture (plus a device check, §5) | host + device |
| 6 | No persistent plaintext temp files | §5 | device |
| 7 | No OOM / ANR / crash | §5 | device |
| 8 | Processing time usable | proposed: enhancement P95 ≤ 1.5 s per receipt on the low-end phone | device |
| 9 | Owner approves Before/After on a real phone | `review/index.html` + in-app | Owner |

- If the data doesn't meet the minimums in §2.1, gates 1–4 show **INSUFFICIENT DATA**. The synthetic
  benchmark cannot be used to approve production.
- Tooling check: the full pipeline (check → ingest → run → summary → review) was run on 3
  **synthetic** cases, only to confirm the tools work. Their numbers are not results, and gates 1–4
  showed INSUFFICIENT DATA as expected.

## 5. Real Android validation (after the real dataset)

See `ANDROID_VALIDATION.md`. The device test needs an app build that includes Receipt Enhance:
- Original and processed are stored separately.
- The user can switch between ต้นฉบับ (original) and ปรับให้อ่านง่าย (enhanced).

That build has not been made. It needs Owner approval once the real-receipt results are in.

## 6. Prohibitions that still apply

- No training or fine-tuning.
- No R3 for Flatten; Custom Dewarp is NOT APPROVED.
- No new benchmarks of UVDoc / DewarpNet / Coons.
- No detector tuning aimed at Flatten.
- No threshold changes after seeing results.
- No uploading images to a server or cloud OCR.
- Never commit real receipts to the repo; `check_dataset.py` refuses folders inside the repo.
- No production merge.
- The OCR temp-file fix (`claude/ocr-temp-cleanup`, `d1cbb22`) is reviewed separately and is not tied to this approval.

## 7. Files

| File | Purpose |
|---|---|
| `enhance_policy.py` | the candidate: tone rule + `enhance()` (does not modify the original) |
| `test_enhance_policy.py` | unit tests for the rule (10 tests) |
| `gate.py` | product gate + data minimums (PROPOSED) |
| `draft_gt.py` | drafts gt.json from the reference image (local OCR/zxing); must be reviewed |
| `check_dataset.py` | checks the folder, reviewed flag, corners and coverage, rejects folders inside the repo, then calls `../ingest_real.py` |
| `run_real_validation.py` | runs the validation, writes the summary and Before/After |
| `ANDROID_VALIDATION.md` | device test protocol |
| `../annotate.html`, `../ingest_real.py`, `../CAPTURE_PROTOCOL.md` | existing tools from R2 (unchanged) |
