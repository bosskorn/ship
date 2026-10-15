# OneScan Thai Receipt Benchmark — real-capture protocol (R0, Owner / QA)

The synthetic set (`gen_bench.py`, 300 cases) has exact ground truth but synthetic crumples. A
production decision needs **real** captures. Target: **300 distorted captures from ≥ 60 different
real receipts**, each with a flat reference of the *same physical receipt*.

## Per receipt
1. **Reference first, while it is still flat** (new receipt) — or flatten it under glass / a heavy
   book for 10 min. Scan it on a flatbed at 300 dpi *or* photograph it under glass in even
   daylight, straight on. Save `ref.png`.
2. Type the ground truth into `gt.json` (template below): every price, VAT, total, date, time,
   receipt no., tax ID, phone, and the QR / barcode payload (decode the flat reference with any
   reader and paste it).
3. Distort and photograph with the OneScan Android app (Scan → Receipt), saving the *original*
   capture (Settings → keep originals) — 4–6 captures per receipt, one condition each:

| Code | Condition | How |
| --- | --- | --- |
| W1 | light wrinkles | crumple loosely, open by hand |
| W2 | heavy wrinkles | crumple into a tight ball, open |
| F1 | folded in half | fold once, press, open |
| F2 | several folds | fold 3–4 times, open |
| C1 | curled | let a fresh roll receipt curl, hold one end |
| C2 | curved edges | lay on a curved surface (book spine, arm) |
| L1 | long | ≥ 40 cm receipt, whole length in frame |
| T1 | faded thermal | old receipt or 1 h in sun / near heat (not touching) |
| S1 | crease shadow | low side light (lamp at 20–30°) |
| S2 | uneven light | one window + indoor lamp; part of receipt in shade |
| P1 | tilted | camera 30–45° off straight |
| B1 | busy background | on patterned tablecloth / desk with clutter |
| X1 | small text | pharmacy / fuel receipts with ≤ 7 pt print |

Language mix to cover across the 60 receipts: ≥ 20 Thai-only, ≥ 20 Thai + English, ≥ 10 with
≥ 10 line items (numeric dense), ≥ 10 with a QR code (PromptPay / e-receipt), ≥ 10 with a barcode.

## Devices
At least 3 Android phones: one low/mid (≤ 4 GB RAM), one mid, one recent. Note model + Android
version in `gt.json`. Do not upload receipts anywhere: copy files over USB.

## Privacy
Use receipts the team owns. Cover / exclude personal names, card numbers and member IDs, or use
receipts without them. Do not commit the real set to the repository.

## gt.json template
```json
{
  "class": "W2", "device": "Galaxy A14 / Android 14", "english": true,
  "lines": ["<every printed line, in order>"],
  "fields": {"date": "15/10/2569", "time": "14:30", "receipt_no": "R01-000123", "tax_id": "0105556000000",
             "phone": "02-123-4567", "branch": "00001", "total": "1,590.00", "vat": "104.02", "pre_vat": "1,485.98",
             "cash": "2,000.00", "change": "410.00", "items": ["…"], "unit_prices": ["…"]},
  "qr": "<payload or empty>", "barcode": "<payload or empty>"
}
```
Then run `evaluate.py` on the folder exactly as on the synthetic set (same metrics, same report).
