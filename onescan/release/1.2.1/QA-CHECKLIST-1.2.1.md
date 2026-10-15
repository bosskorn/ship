# OneScan 1.2.1 QA — Real-device checklist (Owner)

**Build:** `OneScan-v1.2.1-QA-release-debugsigned.apk`.
- Release mode (R8, production flags), versionName 1.2.1, versionCode 14.
- Signed with the **debug key**: QA only, never uploaded to Play.
- Check the SHA-256 before installing. If it does not match, do not test.

**Install:**
- **Uninstall any earlier OneScan first.** RC1–RC4 and the 1.2.0 builds were signed with the
  upload key, so this APK cannot install over them. Uninstalling deletes their documents.
- Install over USB, or by opening the file on the phone.

**Devices:** **at least 2 Android phones**, one of them with ≤ 4 GB RAM. You can start with one
device, but the Production gate does not pass until two devices are done.

**Result per row:** PASS / FAIL, and for a FAIL the severity:
- **RELEASE BLOCKER (P0/P1):** crash, data loss, cannot open the app, cannot scan or save, document
  cannot be opened, encryption error, plaintext residue.
- **P2:** affects an important flow but has a workaround → Owner decides.
- **P3:** cosmetic → BACKLOG, does not stop the release.

**If something fails:** record the steps, a screenshot, and, if a computer is connected,
`adb logcat -b crash -d > crash.txt`.

| D | Model | Android | RAM |
|---|---|---|---|
| D1 | | | |
| D2 | | | |

## A. Core (release blockers if they fail)
| # | Steps | PASS when | D1 | D2 |
|---|---|---|---|---|
| 1 | Install → open → onboarding → Home | Opens, no crash | | |
| 2 | Scan → allow camera | Camera preview appears (not black) | | |
| 3 | Photograph a 3-page document | Edge frame shows; 3 pages in the tray | | |
| 4 | Review → Adjust edges / Crop | Manual crop works and is saved | | |
| 5 | Change filter (auto / color / gray / bw) | Image changes; saved with the chosen filter | | |
| 6 | Thai document → Save → "Text" | Thai text readable | | |
| 7 | English document → Save → "Text" | English text readable | | |
| 8 | Save a document | Saves; appears in Documents | | |
| 9 | Swipe the app away → open → open the document | All pages present and in order | | |
| 10 | Search for a Thai word from item 6 | Finds the right document; opens it | | |
| 11 | Open the PDF of a 5-page document | Pages correct | | |
| 12 | Share PDF → LINE (and another app) → open it on the receiving side | Opens; file name = document title | | |
| 13 | **Airplane mode ON** → repeat 2–12 except LINE (use Files) | Everything works without internet | | |
| 14 | Force stop (Settings → Apps → Force stop) → open → open documents | Opens normally; nothing lost | | |
| 15 | Scan 20 pages → save → scroll through → share PDF | No crash or freeze; 20 pages | | |

## B. OCR temp cleanup (security, `d1cbb22`)
Needs a computer with USB debugging. This QA build is **not debuggable**, so `run-as` cannot read
the app's files.
- **Option 1 (recommended):** check through the app's behaviour plus logcat:
  `adb logcat | grep -i onescan` during OCR. No file paths or document text should appear in the log.
- **Option 2 (deeper check):** we prepare a separate debuggable QA build for checking files directly.
  Tell us if you want it.

| # | Steps | PASS when | D1 | D2 |
|---|---|---|---|---|
| 16 | Save 3 pages normally (OCR succeeds) | Text appears; no error | | |
| 17 | Save a page with no text (table top / landscape) | Saves; text is empty | | |
| 18 | While saving a 20-page document → press Home for 30 s → come back | Saves or cancels cleanly; no crash | | |
| 19 | While saving → force stop → open the app again | Opens normally; earlier documents intact | | |
| 20 | Save 10 times in a row | No crash, no slowdown | | |

## C. Share temp cleanup (new in 1.2.1)
A share copy is deleted only after it is **15 minutes** old (provisional value). This set tests
whether that is long enough.

| # | Steps | PASS when | D1 | D2 |
|---|---|---|---|---|
| 21 | Share PDF → **LINE** → send immediately | Recipient opens it | | |
| 22 | Share PDF → **Gmail** → leave the draft open 5 min → send | The attachment is in the mail | | |
| 23 | Share PDF → **Google Drive** (upload) → return to OneScan right away | The file in Drive opens, complete | | |
| 24 | Share PDF → **Files** → save to Download | The file opens | | |
| 25 | Share → go back to OneScan (resume) → share again | Works every time | | |
| 26 | Share → close OneScan → open again → share another document | Works | | |
| 27 | (Optional, for the minimum age) Share → Gmail → wait **20 min** with OneScan open in the background → return to OneScan → back to Gmail → send | Note whether the attachment still goes (used to decide the 15-min value) | | |

## D. Disabled features must not be reachable
| # | Steps | PASS when | D1 | D2 |
|---|---|---|---|---|
| 28 | Look through every screen: Home, Documents, Tools, Me, Viewer ⋯ | No merge / split / convert PDF, no Sign in / Account, no AI, Cloud, Pro, App lock, Trash, Scan diagnostics, no "Coming soon" | | |
| 29 | (If a computer is connected) `adb shell am start -a android.intent.action.VIEW -d "onescan://cloud"` and the same with `onescan://pricing`, `onescan://scan-diagnostics`, `onescan://account`, `onescan://tools/merge` | Goes back to Home or "not found"; the feature does not open | | |

## E. Stability
| # | Steps | PASS when | D1 | D2 |
|---|---|---|---|---|
| 30 | Open/close the camera 10 times; lock/unlock while the camera is open | Picture comes back; no crash | | |
| 31 | Check after the session: `adb logcat -b crash -d`, `adb shell dumpsys activity anr` | No crash / ANR | | |
| 32 | On the ≤ 4 GB phone: 20 pages + share | No OOM or app restart | | |

## Summary
| | |
|---|---|
| Release blockers found | |
| P2 (Owner decides) | |
| P3 → backlog | |
| Result | ☐ PASS (no P0/P1 on 2 devices) ☐ FAIL |
| Tester / date | |
