# OneScan — Android test builds

| File | Built from | Notes |
| --- | --- | --- |
| `OneScan-v1.0.2-arm64.apk` | branch `claude/onescan-mobile-v1` | V1.0.2 (versionCode 3), arm64-v8a, release build signed with the debug key — for testing only. Installs over earlier builds. |

## Changes in 1.0.2
- Pages are detected by tint as well as brightness (camera Cb/Cr): white paper on a light floor under room lighting.
- Fixed: pages whose left/right edges lean opposite ways (perspective) were never outlined.

## Changes in 1.0.1
- New document edge detector (edge-driven): no more borders that merge an object with the floor/shadow or follow objects cut off by the frame.
- Border is shown only when auto-capture would accept it; overlay is clipped to the camera area.
- Auto capture after ~1 s of holding steady.

Install: download the APK on an Android phone (Android 7+ / arm64), allow "Install unknown apps" for the browser, open the file.
Checksums: see `SHA256SUMS`. Previous builds remain in this branch's history.
