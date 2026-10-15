#### Distorted set (300): content integrity (numbers: exact % / ALTERED count)

| method | n | CER | WER | Amount (total, pre-VAT, cash, change, items, unit prices) | VAT | Date | Time | Receipt No. | Tax ID | Phone | QR | Code128 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reference | 300 | 0.083 | 0.236 | 99.9% / 0 | 97.7% / 0 | 98.7% / 0 | 100.0% / 0 | 40.0% / 0 | 100.0% / 0 | 99.7% / 0 | 100.0% | 100.0% |
| persp | 300 | 0.260 | 0.571 | 74.4% / 133 | 75.0% / 2 | 75.3% / 2 | 83.7% / 7 | 33.3% / 0 | 75.7% / 12 | 78.0% / 5 | 60.3% | 93.3% |
| classical | 300 | 0.191 | 0.517 | 79.9% / 116 | 79.7% / 3 | 86.3% / 4 | 88.7% / 1 | 40.3% / 0 | 86.7% / 7 | 89.3% / 3 | 60.7% | 96.0% |
| classical_crisp | 300 | 0.175 | 0.449 | 86.1% / 107 | 82.7% / 5 | 85.7% / 3 | 90.7% / 2 | 39.0% / 1 | 83.3% / 7 | 83.0% / 4 | 56.7% | 95.3% |
| uvdoc | 300 | 0.209 | 0.571 | 71.9% / 203 | 75.0% / 5 | 83.7% / 3 | 81.7% / 3 | 47.7% / 0 | 86.7% / 6 | 85.3% / 3 | 53.0% | 97.7% |
| dewarpnet | 300 | 0.275 | 0.754 | 68.9% / 252 | 75.0% / 5 | 82.7% / 7 | 79.3% / 6 | 37.3% / 1 | 82.3% / 9 | 82.0% / 5 | 36.7% | 90.3% |
| uvdoc_rect | 300 | 0.339 | 0.746 | 62.7% / 244 | 56.7% / 9 | 63.7% / 21 | 66.7% / 10 | 26.0% / 2 | 74.0% / 12 | 64.7% / 7 | 23.0% | 95.0% |

#### Distorted set (300): verdict vs perspective-only (per case)

| method | PASS | FAIL-integrity | FAIL-readability | ERROR | missing/skipped |
|---|---|---|---|---|---|
| classical | 168 | 73 | 59 | 0 | 0 |
| classical_crisp | 219 | 60 | 21 | 0 | 0 |
| uvdoc | 107 | 121 | 72 | 0 | 0 |
| dewarpnet | 47 | 161 | 92 | 0 | 0 |
| uvdoc_rect | 34 | 197 | 69 | 0 | 0 |

#### Distorted set (300): geometry and shading

| method | n | text-line curvature above flat ref (px) | edge waviness (px) | background in border | ink with >15% stretch | local distortion LD (px) | residual shading (CoV) |
|---|---|---|---|---|---|---|---|
| persp | 300 | 0.26 | 13.0 | 8.3% | 11.3% | 10.97 | 0.081 |
| classical | 300 | 0.23 | 0.6 | 0.6% | 11.3% | 10.99 | 0.009 |
| classical_crisp | 300 | 0.22 | 0.5 | 0.5% | 11.3% | 10.84 | 0.011 |
| uvdoc | 300 | 0.40 | 0.7 | 0.9% | 10.8% | 11.72 | 0.010 |
| dewarpnet | 300 | 0.78 | 3.2 | 11.9% | 12.4% | 18.16 | 0.016 |
| uvdoc_rect | 300 | 1.05 | 0.8 | 3.1% | 48.2% | 38.69 | 0.009 |

#### Distorted set (300): failure types (cases; a case can have several)

| failure type | classical | classical_crisp | uvdoc | dewarpnet | uvdoc_rect |
|---|---|---|---|---|---|
| QR / barcode damaged | 3 | 16 | 36 | 85 | 124 |
| background left in output | 4 | 4 | 7 | 177 | 4 |
| bad boundary (shared detector) | 41 | 41 | 41 | 41 | 41 |
| incorrect dewarp / content displaced | 28 | 29 | 36 | 63 | 292 |
| long-receipt failure | 15 | 14 | 19 | 19 | 19 |
| numeric corruption (misread vs before) | 71 | 50 | 101 | 117 | 135 |
| performance (>10 s on host, 1 thread) | 0 | 0 | 0 | 14 | 0 |
| text removed / cropped | 3 | 2 | 15 | 29 | 124 |
| text stretching | 24 | 24 | 18 | 23 | 265 |

Examples (Distorted set (300)):

- classical — QR / barcode damaged: 070_long, 154_tilted, 249_uneven_light
- classical — background left in output: 074_tilted, 105_uneven_light, 114_fold_half
- classical — bad boundary (shared detector): 004_curl, 008_crease_shadow, 020_curl
- classical — incorrect dewarp / content displaced: 008_crease_shadow, 050_fold_half, 057_uneven_light
- classical — long-receipt failure: 006_long, 038_long, 054_long
- classical — numeric corruption (misread vs before): 003_fold_multi, 000_wrinkle_light, 004_curl
- classical — text removed / cropped: 107_busy_background, 114_fold_half, 297_uneven_light
- classical — text stretching: 008_crease_shadow, 050_fold_half, 057_uneven_light
- classical_crisp — QR / barcode damaged: 070_long, 087_thermal_faded, 086_long
- classical_crisp — background left in output: 074_tilted, 105_uneven_light, 114_fold_half
- classical_crisp — bad boundary (shared detector): 004_curl, 008_crease_shadow, 020_curl
- classical_crisp — incorrect dewarp / content displaced: 008_crease_shadow, 050_fold_half, 057_uneven_light
- classical_crisp — long-receipt failure: 006_long, 038_long, 054_long
- classical_crisp — numeric corruption (misread vs before): 006_long, 023_thermal_faded, 030_thai_english
- classical_crisp — text removed / cropped: 107_busy_background, 114_fold_half
- classical_crisp — text stretching: 008_crease_shadow, 050_fold_half, 057_uneven_light
- uvdoc — QR / barcode damaged: 002_fold_half, 005_curved_edges, 006_long
- uvdoc — background left in output: 015_numeric_dense, 106_tilted, 114_fold_half
- uvdoc — bad boundary (shared detector): 004_curl, 008_crease_shadow, 020_curl
- uvdoc — incorrect dewarp / content displaced: 015_numeric_dense, 026_tilted, 040_crease_shadow
- uvdoc — long-receipt failure: 006_long, 022_long, 038_long
- uvdoc — numeric corruption (misread vs before): 000_wrinkle_light, 008_crease_shadow, 006_long
- uvdoc — text removed / cropped: 015_numeric_dense, 026_tilted, 038_long
- uvdoc — text stretching: 040_crease_shadow, 057_uneven_light, 059_busy_background
- dewarpnet — QR / barcode damaged: 007_thermal_faded, 005_curved_edges, 006_long
- dewarpnet — background left in output: 003_fold_multi, 002_fold_half, 000_wrinkle_light
- dewarpnet — bad boundary (shared detector): 004_curl, 008_crease_shadow, 020_curl
- dewarpnet — incorrect dewarp / content displaced: 006_long, 015_numeric_dense, 023_thermal_faded
- dewarpnet — long-receipt failure: 006_long, 022_long, 038_long
- dewarpnet — numeric corruption (misread vs before): 003_fold_multi, 000_wrinkle_light, 007_thermal_faded
- dewarpnet — performance (>10 s on host, 1 thread): 003_fold_multi, 002_fold_half, 000_wrinkle_light
- dewarpnet — text removed / cropped: 006_long, 015_numeric_dense, 023_thermal_faded
- dewarpnet — text stretching: 040_crease_shadow, 057_uneven_light, 059_busy_background
- uvdoc_rect — QR / barcode damaged: 002_fold_half, 007_thermal_faded, 010_tilted
- uvdoc_rect — background left in output: 086_long, 127_numeric_dense, 134_long
- uvdoc_rect — bad boundary (shared detector): 004_curl, 008_crease_shadow, 020_curl
- uvdoc_rect — incorrect dewarp / content displaced: 003_fold_multi, 002_fold_half, 000_wrinkle_light
- uvdoc_rect — long-receipt failure: 006_long, 022_long, 038_long
- uvdoc_rect — numeric corruption (misread vs before): 001_wrinkle_heavy, 007_thermal_faded, 004_curl
- uvdoc_rect — text removed / cropped: 002_fold_half, 001_wrinkle_heavy, 007_thermal_faded
- uvdoc_rect — text stretching: 003_fold_multi, 002_fold_half, 000_wrinkle_light

#### Flat control (32 receipts already flat): content integrity (numbers: exact % / ALTERED count)

| method | n | CER | WER | Amount (total, pre-VAT, cash, change, items, unit prices) | VAT | Date | Time | Receipt No. | Tax ID | Phone | QR | Code128 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reference | 32 | 0.068 | 0.203 | 99.2% / 0 | 96.9% / 0 | 100.0% / 0 | 100.0% / 0 | 43.8% / 0 | 100.0% / 0 | 100.0% / 0 | 100.0% | 100.0% |
| persp | 32 | 0.159 | 0.431 | 76.3% / 8 | 71.9% / 2 | 93.8% / 0 | 71.9% / 0 | 43.8% / 0 | 87.5% / 1 | 84.4% / 0 | 96.9% | 93.8% |
| classical | 32 | 0.131 | 0.388 | 76.7% / 7 | 81.2% / 1 | 90.6% / 0 | 84.4% / 0 | 40.6% / 0 | 93.8% / 1 | 93.8% / 0 | 96.9% | 96.9% |
| classical_crisp | 32 | 0.110 | 0.301 | 94.3% / 1 | 90.6% / 0 | 90.6% / 0 | 84.4% / 0 | 40.6% / 0 | 87.5% / 1 | 90.6% / 0 | 96.9% | 96.9% |
| uvdoc | 32 | 0.145 | 0.449 | 81.4% / 7 | 81.2% / 0 | 84.4% / 0 | 96.9% / 0 | 43.8% / 0 | 84.4% / 1 | 90.6% / 0 | 100.0% | 96.9% |
| dewarpnet | 32 | 0.194 | 0.650 | 82.2% / 6 | 75.0% / 0 | 96.9% / 0 | 84.4% / 1 | 34.4% / 0 | 90.6% / 0 | 96.9% / 0 | 100.0% | 93.8% |
| uvdoc_rect | 32 | 0.216 | 0.572 | 78.2% / 7 | 75.0% / 0 | 71.9% / 1 | 84.4% / 0 | 28.1% / 1 | 90.6% / 2 | 87.5% / 0 | 84.4% | 96.9% |

#### Flat control: verdict vs perspective-only (per case)

| method | PASS | FAIL-integrity | FAIL-readability | ERROR | missing/skipped |
|---|---|---|---|---|---|
| classical | 21 | 3 | 8 | 0 | 0 |
| classical_crisp | 29 | 1 | 2 | 0 | 0 |
| uvdoc | 16 | 3 | 13 | 0 | 0 |
| dewarpnet | 5 | 6 | 21 | 0 | 0 |
| uvdoc_rect | 5 | 10 | 17 | 0 | 0 |

#### Flat control: geometry and shading

| method | n | text-line curvature above flat ref (px) | edge waviness (px) | background in border | ink with >15% stretch | local distortion LD (px) | residual shading (CoV) |
|---|---|---|---|---|---|---|---|
| persp | 32 | -0.24 | 9.9 | 4.3% | 6.1% | 6.22 | 0.064 |
| classical | 32 | -0.26 | 0.4 | 0.3% | 6.0% | 6.32 | 0.009 |
| classical_crisp | 32 | -0.23 | 0.3 | 0.2% | 6.1% | 6.23 | 0.011 |
| uvdoc | 32 | -0.04 | 0.3 | 0.3% | 6.0% | 8.76 | 0.010 |
| dewarpnet | 32 | 0.20 | 2.7 | 9.9% | 5.2% | 15.20 | 0.016 |
| uvdoc_rect | 32 | 0.55 | 0.7 | 2.9% | 31.0% | 26.03 | 0.010 |

UVDoc warp estimate (grid deviation from flat, normalised units): flat receipts median 0.0102 (p90 0.0155); gate threshold fixed at 0.008 before results.

Gate (uvdoc only if warped and nothing read worse): dewarp applied to **18 / 32** flat receipts.

Flat-vs-warped separability by UVDoc grid deviation: distorted median 0.0112, flat median 0.0102; best possible balanced accuracy at 0.0115: 0.61 (diagnostic only — the gate threshold was not changed).

#### Performance (this host, 1 CPU thread per process, same 300 + 32 workload)

| method | init / model load (s) | median s/receipt | P95 s/receipt | long receipts median (s) | peak RAM (MB) | temp storage peak (MB) | output JPEG median (KB) | failures / OOM / crash |
|---|---|---|---|---|---|---|---|---|
| dewarpnet | 8.41 | 6.08 | 7.27 | 7.51 | 1398 | 0.0 | 471 | 0 |
| uvdoc | 2.18 | 0.57 | 1.37 | 1.57 | 1063 | 0.0 | 464 | 0 |
| classical | 1.64 | 0.22 | 0.73 | 0.93 | 1015 | 0.0 | 507 | 0 |
| classical_crisp | 1.49 | 0.15 | 0.30 | 0.38 | 622 | 0.0 | 225 | 0 |
| persp | 1.26 | 0.10 | 0.16 | 0.17 | 345 | 0.0 | 429 | 0 |

