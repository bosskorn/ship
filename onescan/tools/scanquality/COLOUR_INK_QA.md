# Scan filter — coloured ink QA (2026-10-13)

Default "auto" scan look (Android `PageProcessor.scanLook`), QA scenes from the
`claude/onescan-scan-qa-wip` harness (A4 + ID card, lighting A normal, B warm, C window,
D uneven, E shadow), real Kotlin code via the JVM.

**Red stamp bug.** The luminance-ratio tone curve on the QA branch (never merged) crushes
saturated ink towards black. The shipping per-channel curve kept the bright stamp of the
QA scene, but a *dark red* stamp (150,25,35) still darkened 64 → 45 luma
(`ColourInkTest`). Fix: coloured ink may end at most 8 luma levels darker than its
paper-corrected input (lifted back, hue and chroma kept). Same rule ported to the iOS
Core Image kernel (not compiled here — needs an iOS build check).

| Check (A / B / C / D / E) | Before | After |
|---|---|---|
| red stamp ΔE ≤ 15 | 7.4 / 9.9 / 6.0 / 7.0 / 3.9 | 7.6 / 10.1 / 6.3 / 7.3 / 4.1 |
| red stamp L* change −10…10 | +5.9 / +6.1 / +5.2 / +5.7 / +3.3 | +6.2 / +6.4 / +5.5 / +6.0 / +3.7 |
| red stamp chroma 0.85–1.25 | 1.05 / 1.08 / 1.03 / 1.05 / 1.01 | same |
| blue signature ΔE ≤ 15 | 4.9 / 14.1 / 5.5 / 4.8 / 4.8 | 6.5 / 14.9 / 7.0 / 6.4 / 6.5 |
| dark red stamp, unit test | 64 → 45 luma ✗ | passes (≥ 49) |

Failing checks overall: 22 before, 22 after (no new failures). Still failing, P1 colour
issues, not the stamp: logo ΔE 15.6–17.7 (≤ 15), paper tint under warm light 19 (≤ 6),
card filter base ΔE 11–14 (≤ 10), card evenness 13–20 (≤ 12), card skin in shadow 15.4 (≤ 10).
