# Presence gate v2 — frozen (2026-10-13)

Locked as the pipeline gate. Do not retrain or retune unless real-device data shows
false "present" > 1% on photos without a document, or real documents marked "none" > 2%.

| What | Value |
|---|---|
| Weights | `src/core/document-engine/capture/crop/presenceWeights.ts` sha256 `e624164f3fb70671952d9082f07b8ed3c66da741c9134fd9ca6688f4ccfbfc4e` |
| Training checkpoint | `presence_v2.pt` sha256 `3e48d107fd169254a939d7f55d4c181276f8c79a4d206e42dcbbfc114819dfab` (not in the repo) |
| Parity vector | `tools/presence/presence_parity.bin` sha256 `53dc8bc38596343ef03ca7d3500c9b39dc57ca78c9cacf5a178e15d1525e1deb` |
| Thresholds | present >= 0.867770, none <= 0.000564; between = uncertain (kept three-way) |

Held-out sets (never used for training or thresholds):
- real benchmark `test` split (photos with and without a document), 1,453 documents / 199 empty;
- every 5th CC0 surface photo (sorted by file name), whole + 4 quarter views;
- the DocSeg validation shards (training-distribution check only).

Results at freeze: held-out real false "present" 0.0% (0/199), documents present 77.9%,
uncertain 21.2%, none 0.9%; held-out surfaces false "present" 0.32% (1/315).
