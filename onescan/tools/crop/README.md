# Auto crop scorer

Post-capture crop (`src/core/document-engine/capture/crop/`) no longer takes "the largest
region / strongest rectangle". It collects every plausible page outline (DocSeg mask regions
at several thresholds, edge-detector quads, the text block, the whole frame) and scores each
on what it encloses and how it is bounded:

| feature | why |
| --- | --- |
| mask agreement (inside / outside / IoU) | learned page segmentation |
| text recall and density, text span | pages carry text; floors, grout and wood grain don't |
| edge support (weakest side, mean), side contrast | a real sheet has a continuous edge on every side |
| paper texture / evenness | paper is smooth between the text, at any colour |
| background penalty (rough non-text cells inside) | marble veins, tiles, wood inside the outline |
| outline near-full-frame with text only in a small part | the classic "selected the table" failure |
| aspect, centre distance, corners on the frame border | plausibility priors |

The weights are a logistic model, so the score is a probability that the crop is right; it
drives the gate: ≥ 0.85 auto-apply, 0.65–0.85 apply + "Adjust edges", below that the crop
editor opens with the suggested corners.

## Reproduce

Benchmarks are built locally from the DocCornerDataset test split (real photos) and from
synthetic documents-on-surfaces (real pages rectified from tune photos, composited on marble
with grout lines, wood, ruled, white and dark surfaces). Photos are split into `tune` (fits
the weights) and `test` (reported only). No images are stored in this repository.

```bash
node dump.js <bench dir> feat.jsonl          # candidates + features + corner error per photo
python3 fit.py --train real.jsonl syn.jsonl --test real.jsonl syn.jsonl \
  --cases real/cases.json syn/cases.json --old old_real.json old_syn.json \
  --out ../../src/core/document-engine/capture/crop/cropModel.ts
```

A crop counts as right when every corner is within 3% of the image diagonal of the truth.

## Results (model `v1-1755`, held-out photos only)

Real photos (DocCornerDataset test splits 3 + 6), corner error ≤ 3% of the diagonal:

| | old crop path | new |
| --- | --- | --- |
| cards (711) | 20.4% (whole frame kept 56%) | 55.0% |
| documents (542) | 21.0% (whole frame kept 46%) | 48.5% |
| receipts (200) | 14.5% (whole frame kept 61%) | 56.5% |
| photos without a document (199) | — | no crop 100% |

Calibration: of crops scored ≥ 0.85 (auto-applied), 89% are right; 0.65–0.85: 65%; below: 42%.

Synthetic documents on surfaces (pages not seen in fitting): marble with grout 0% → 69%,
ruled 3% → 71%, white 0% → 92%, wood 61% → 93%, dark 42% → 90%.

The KPI (95% documents, 97% cards, 90% receipts) is **not** met yet. The remaining gap is
candidate generation: on real photos the right outline exists among the candidates for only
~69–76% of photos, mostly limited by the page-segmentation model (DocSeg).
