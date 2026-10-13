# DocSeg — document segmentation model

Small learned model that finds the page in a camera frame. It replaces the classical
edge detector (`src/core/document-engine/capture/quadDetector.ts`) as the primary page
detector, because classical edges failed on real photos (glare, busy backgrounds,
ID-card artwork, low contrast). The classical detector is still used when no mask is available.

- **Input**: Y/Cb/Cr planes resized to 128×128 (the planes the camera already produces).
- **Output**: 64×64 page probability map → `maskToQuad` (largest region → hull → max-area
  quad → sub-pixel side fits). Stills are then refined on 640 px gradients.
- **Size**: ~64k parameters (~250 KB float32), ~40 MFLOPs per frame. No ML runtime:
  the net is re-implemented in plain code with identical math:
  - `src/core/document-engine/capture/docSeg.ts` (reference, tests, benchmarks)
  - `modules/onescan-vision/android/.../DocSeg.kt` (camera frames + stills)
  - `modules/onescan-vision/ios/DocSeg.swift`
  The JVM and jest tests check each runtime against the PyTorch parity vector.
- **Weights**: `modules/onescan-vision/android/src/main/assets/docseg.bin` and
  `modules/onescan-vision/ios/docseg.bin` (identical; a test checks this). Since 1.1.2 these
  are the `v2` checkpoint: on the DocCornerDataset held-out photos, mask IoU ≥ 0.9 on 46% of
  photos (mIoU 0.755) vs 21% (mIoU 0.675) for the earlier interim weights. The mask is one
  input to the post-capture crop scorer (`tools/crop`), not the crop by itself.

## Training

```bash
pip install torch numpy pyarrow pillow
python3 train.py --data <dir of .npz shards> --out docseg.pt --epochs 20
python3 export.py docseg.pt docseg.bin docseg_parity.bin
```

Shards hold `imgs` (N×160×160×3 RGB, squashed), `corners` (N×8 normalised TL,TR,BR,BL)
and `neg` (no document). Masks are rendered from the corners after augmentation.

## Data and licensing

The shipped weights were trained on the
[DocCornerDataset](https://huggingface.co/datasets/mapo80/DocCornerDataset) train/val
splits. It combines MIDV-500/2019 and SmartDoc (research use), COCO negatives (CC BY 4.0)
and Roboflow Universe sets (various licences). **Review these licences before a commercial
release**, or retrain on licensed or in-house photos with the same scripts. No dataset
images are stored in this repository.

Held-out benchmark: the DocCornerDataset test split (2,652 photos: ID cards, passports,
receipts, books, A4 pages, business cards, and photos without documents).
