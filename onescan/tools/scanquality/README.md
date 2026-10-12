# Scan sharpness test set (v1.0.5)

`make_testset.py` draws an A4 page at 300 dpi (6/8/10 pt text, light-grey text, table,
Code 128, QR, signature, stamp) and simulates a phone scanner's output (≈12 MP, mild blur,
uneven warm light, noise, JPEG 92). `evaluate.py` checks that barcode and QR still decode
and how much fine detail survives, compared at 600 dpi.

Result on the 1.0.5 pipeline (Kotlin `PageProcessor.scanLook`, run on the JVM):

| Pipeline | Size | QR | Code 128 | Detail 8 pt |
| --- | --- | --- | --- | --- |
| Scanner original | 3024 × 4277, 1.9 MB | ✓ | ✓ | 0.868 |
| 1.0.4 (2480 px cap, JPEG 88) | 1754 × 2480, 266 KB | ✓ | **✗** | 0.826 |
| 1.0.5 High (full res, JPEG 95) | 3024 × 4277, 764 KB | ✓ | ✓ | 0.870 |
