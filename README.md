# OneScan — Android test builds

| File | Built from | Notes |
| --- | --- | --- |
| `OneScan-v1.0.5-arm64.apk` | branch `claude/onescan-mobile-v1` | V1.0.5 (versionCode 6), arm64-v8a, release build signed with the debug key — for testing only. Installs over earlier builds. |

## Changes in 1.0.5
- Full-resolution scans: the scanner's original is kept, the saved page is rendered once at full resolution (JPEG 95), PDFs embed it unchanged. Previously pages were shrunk to 2480 px at JPEG 88.
- Tap a page in a document to zoom (pinch / double-tap) on the full-resolution image.
- Settings → Scan quality (Standard / High / Maximum) and Scan diagnostics.
- Filters and crops are re-applied to the original, so changing them never loses quality.

## Changes in 1.0.4
- New default "Scan" filter: white paper (shadows and lamp tint removed), dark crisp text, colour kept for stamps, logos and ID photos. Other filters (Original, Document, Color, Gray, B&W) are unchanged in the editor.

## Changes in 1.0.3
- Scan now opens Google's ML Kit Document Scanner (on device, via Google Play services): reliable edge detection, auto capture and crop for documents, ID cards, passports and receipts; multi-page; import from gallery with auto crop.
- Scanned pages go through OneScan's own enhance → OCR (Thai + English) → PDF → search pipeline. Nothing is uploaded.
- Phones without Google Play services fall back to the in-app camera.

## Changes in 1.0.2
- Pages are detected by tint as well as brightness (camera Cb/Cr): white paper on a light floor under room lighting.
- Fixed: pages whose left/right edges lean opposite ways (perspective) were never outlined.

## Changes in 1.0.1
- New document edge detector (edge-driven): no more borders that merge an object with the floor/shadow or follow objects cut off by the frame.
- Border is shown only when auto-capture would accept it; overlay is clipped to the camera area.
- Auto capture after ~1 s of holding steady.

Install: download the APK on an Android phone (Android 7+ / arm64), allow "Install unknown apps" for the browser, open the file.
Checksums: see `SHA256SUMS`. Previous builds remain in this branch's history.
