# Receipt Restore — licence review (R&D, not legal advice)

Checked on 2026-10-15 from each project's own repository. "Research prototype ≠ production
approval": anything marked *needs legal review* must not be bundled until the Owner (and counsel)
signs off.

| Candidate | Family | Code licence | Weights | Training data | Benchmark use | Production (bundle in OneScan) |
| --- | --- | --- | --- | --- | --- | --- |
| **UVDoc** (tanguymagne/UVDoc, 2023) | grid unwarping | MIT | `model/best_model.pkl` in the MIT repo (32 MB fp32) | Doc3D + UVDoc dataset | ✅ run | ⚠️ *needs legal review*: weights are distributed under the repo's MIT licence, but they were trained on Doc3D, whose texture sources are mixed (see below). A PaddlePaddle re-release (`PaddlePaddle/UVDoc` on Hugging Face) is tagged Apache-2.0, which helps but does not settle data provenance. |
| **DewarpNet** (cvlab-stonybrook/DewarpNet, ICCV 2019) | DocUNet family (Doc3D, 3D coords → backward map) | MIT | Google Drive, linked from the README (unetnc 167 MB + dnetccnl 181 MB) | Doc3D | ✅ run | ⚠️ *needs legal review*, same Doc3D question; also impractical size for a phone (348 MB fp32) |
| **DocUNet** (Ma et al., CVPR 2018) | original | no official code or weights released | — | — | ❌ nothing official to run; DewarpNet (same lab, Doc3D successor, evaluated on the DocUNet benchmark) stands in for the family | ❌ |
| **DocTr** (fh2019ustc/DocTr) | transformer geometry + illumination | Custom: **Non-Commercial only**; "Commercial Use … any use intended for or directed toward commercial advantage … strictly prohibited without explicit prior written permission" | Google Drive / Baidu | Doc3D (+ illumination data) | ❌ **not run**: benchmarking it to choose a component for a commercial app is use "directed toward commercial advantage" | ❌ unless the author (haof@mail.ustc.edu.cn) grants a written commercial licence |
| **DocTr++** (fh2019ustc/DocTr-Plus) | unrestricted rectification | same Non-Commercial licence (identical file) | Google Drive | — | ❌ **not run** (same reason) | ❌ same |

## Doc3D dataset (used to train both models we ran)
- Scripts: MIT (cvlab-stonybrook/doc3D-dataset).
- The images are rendered from document textures listed as: *Yes! Magazine* "under Creative Commons
  Licence" (variant not stated), papers from *CVF Open Access* (author copyright), and books from
  *Project Gutenberg*. No licence is stated for the rendered dataset itself.
- Weights trained on it are not obviously restricted, but the provenance is not clean enough to
  call "approved" without review.

## What this means for the decision
- Only MIT-licensed candidates were run. Neither is production-cleared until the data-provenance
  question is reviewed.
- DocTr / DocTr++ can only be evaluated after the Owner obtains written permission from the author.
  If permission is granted, the harness runs them unchanged (add a method in `methods.py`).
- The classical pipeline (`classical`, `classical_crisp`) uses only OpenCV operations (Apache-2.0,
  already in OneScan's native stack via our own Kotlin code) — no third-party model, no data
  provenance question.
