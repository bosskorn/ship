# Receipt Enhance — Real Android validation protocol

**When:** after the real-receipt dataset (REAL-RECEIPT-VALIDATION.md) has been run, and only on an
app build that contains Receipt Enhance. That build does not exist yet and needs Owner approval.

**What the build must do:**
- Keep the original capture byte-for-byte.
- Write the enhanced image as a new, separate representation.
- Let the user switch between ต้นฉบับ (original) and ปรับให้อ่านง่าย (enhanced).
- Use the same `enhance-policy-1` rule and thresholds as the host tool, with no changes.

## Devices
At least 3 Android phones, with model, Android version and RAM recorded:
- low-end, ≤ 4 GB RAM
- mid-range
- recent

Use a release build (R8 on), signed with the upload key. Never use a debug key.

## Set
- The same real receipts as the host run: every condition code, including at least 10 long receipts.
- Each receipt is processed 3 times per device, so P95 is meaningful.

## Run conditions
- **Airplane mode ON** for the whole run, with Wi-Fi and mobile data off. Everything must still work.
- No upload of any image: the enhancement path has no network code. Optionally confirm with
  `adb shell dumpsys netstats detail` before and after (the app's bytes must not change).

## Measures

| Measure | How | Pass (proposed) |
|---|---|---|
| Processing time, median and **P95** | app diagnostics timing around the enhancement step only, per receipt | P95 ≤ 1.5 s on the low-end phone |
| Peak RAM | `adb shell dumpsys meminfo <package>` during the run (TOTAL PSS peak) | no OOM; record value |
| Temp storage | `adb shell run-as <package> du -a cache files` before / during / after; no plain image left after processing, an error or cancel | 0 persistent plaintext files |
| Crash | `adb logcat -b crash` | 0 |
| OOM | logcat `OutOfMemoryError` | 0 |
| ANR | `adb shell dumpsys activity anr`, `/data/anr` (bugreport) | 0 |
| Battery / thermal | `adb shell dumpsys battery` and `dumpsys thermalservice` before / after 30 receipts in a row | observation only; note throttling |
| QR decode | in-app or host decode of the enhanced image vs the truth payload | no regression vs original |
| Barcode decode | same, any 1-D symbology | no regression vs original |
| Numeric integrity | export the enhanced images, run `run_real_validation.py`'s scoring on them | same gate as host (gate 2) |
| Thai readability | Owner reads Thai lines on the phone, Before / After | Owner judgement |
| Original unchanged | SHA-256 of the stored original before and after enhancement (export both) | identical |

Also check that a process kill in the middle of enhancement leaves no plaintext temp file (same
guarantee as the OCR temp-file fix) and that the original is still intact.

## Owner review on the phone
Open each receipt and switch between ต้นฉบับ and ปรับให้อ่านง่าย. For each receipt, record
approve / reject and the reason. Rejects are listed in the final report next to their numbers.
