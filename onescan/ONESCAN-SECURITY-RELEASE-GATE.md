# OneScan Security Release Gate — READY FOR OWNER DECISION

**Owner decision:** NO-GO for the existing 1.2.0 AAB.

**This round:**
- Investigation only.
- No code changed, no build, no merge, no version change, no git-history rewrite.
- No secret value was printed or copied.

**Branch:** `claude/agent-skills-baseline`, on top of `e627c6f`.

## A. Repository secret check — `/home/user/ship/.env`

| Variable | Classification | Evidence (structure only, no value shown) |
|---|---|---|
| `DATABASE_URL` | **secret / credential** | `postgresql://` URL with a username **and a non-placeholder password**, host on **Neon (managed cloud Postgres)**, with query parameters (length 123) |

**Details:**
- Tracked in git since `0a80b98` (2025-06-04, "Add files via upload").
- Present in the history of **every** branch: 24 local and remote refs contain that commit, and the
  history is pushed to GitHub.
- It is used by the repository-root `index.js`, a separate address/API project. **OneScan code does
  not use it.**

**Assessment:**
- **Credential exposure: YES.** Anyone who has, or had, access to the repository can read it.
- **Rotation required: YES.**
  - Rotate the Neon database role password (or the whole role), then check the Neon project for
    unexpected access.
  - Update whatever deploys the root `index.js` project.
  - Do not keep using the old value.
- Per the decision rule: **STOP before build.**
  - The agent did not rewrite history.
  - Removing the file from the tree and purging history is a separate Owner decision, to be made
    after rotation.

## B. `d1cbb22` — real Android QA

| Level | Result |
|---|---|
| **REAL DEVICE** | **NOT RUN — BLOCKED.** This cloud container has no Android device, no `adb`, no emulator and no `/dev/kvm`. No phone has been connected to this session |
| **EMULATOR** | **NOT RUN.** Same reason |
| **HOST** (earlier record, for reference only, **not** Android QA) | PlainTempTest 6/6 (success, failure, interruption, tampered input, plaintext pass-through, sequential repeated calls) + onescan-vision JVM suite PASS |

| Reported item | Value |
|---|---|
| Device / model | none |
| Android version | none |
| Scenarios | 0 / 8 run |
| Plaintext residue evidence | none |
| Crashes / ANR | not measured |

**Needed from the Owner to unblock:**
1. **A QA build that contains `d1cbb22`.** None exists. Building one needs approval. Proposal:
   - A **non-production QA APK, debug-signed**, installed fresh on a test phone.
   - It never goes to Play, so it does not consume a versionCode.
   - The fix cherry-picks **cleanly** onto the 1.2.0 source `78c0121` (checked with `git merge-tree`;
     nothing was written), and it is already based on the 1.3 line `f744530`. The Owner chooses the base.
2. **A phone with USB debugging** and a computer with `adb`. The Owner runs the runbook below, or
   connects the device to an approved machine.

### Runbook (REAL DEVICE): run the same checks after every scenario
```
adb shell run-as app.onescan.mobile find cache/onescan/plain -type f      # expect: no OCR copy left
adb shell run-as app.onescan.mobile ls -la cache/onescan/plain/scoped     # expect: empty or missing
adb logcat -b crash -d ; adb shell dumpsys activity anr                    # expect: nothing new
```
Note the time and the file count before each scenario. A file in `scoped/` is allowed **only while**
recognition is running.

| # | Scenario | How | PASS when |
|---|---|---|---|
| 1 | OCR success | Scan 3 pages → Save (OCR runs) | After the save finishes, no OCR copy is in `plain/` or `plain/scoped/` |
| 2 | OCR failure | Save a page with no text, and a corrupt/tampered page (encrypted file with one byte changed via `run-as`) | No file left; the app shows the error or saves without text; no crash |
| 3 | Cancel / interruption | Start saving a 20-page document → Cancel mid-OCR. Also let a page hit the 60 s JS timeout if possible | After native recognition finishes, `scoped/` is empty |
| 4 | Background / foreground | Mid-OCR press Home, wait 30 s, return | OCR completes or fails cleanly; no residue afterwards |
| 5 | Process restart | Mid-OCR: `adb shell am kill app.onescan.mobile` (background) **and** force-stop from Settings → relaunch → open any document | After the first document read of the new launch, `plain/` (including `scoped/`) is empty |
| 6 | Repeated OCR | Run OCR / save 10 times in a row, and on 2 documents back-to-back | No growth in `scoped/`; no crash or ANR |
| 7 | Document modified during processing | While a save/OCR runs, open the same document in Page Manager / edit (if the UI allows), or delete it from the list | No crash; no residue; the original stays readable or is deleted as asked |
| 8 | Location check | After each case, list `cache/onescan`, `files/`, and external storage `/sdcard/Android/data/app.onescan.mobile` | No decrypted page outside the app-private cache; none left in `scoped/` |

Also record: device model, Android version, RAM, build commit, and pass/fail per row.

## C. Share plaintext — investigation only

**Where the file is created:**
- `ExportEngine.sharePdf` → `DocumentFileStore.readableUri(uri, "<Title>.pdf")` → native
  `plainUriAsync` → `SecureFiles.plain(file, name)`.
- It decrypts to `cache/onescan/plain/<sha1>/<Title>.pdf`, which is app-private.
- `expo-sharing` 57.0.22 then:
  - makes a `content://` URI through its `SharingFileProvider` (the `cache-path "."` root);
  - calls `grantUriPermission(READ)` for **every app that can handle the share chooser**;
  - opens the chooser with `startActivityForResult`.
- `ImageExportService.shareOne` does the same for a JPG/PNG under `plain/export-<id>/`. It is not
  deleted after sharing; `saveToDevice` does delete.

**Current lifecycle and cleanup:**
- The copy is reused while the source is unchanged.
- It is deleted only:
  - (a) at the **next app launch**, by `plainCacheReady()` → `clearPlainCache()` before the first
    document read;
  - (b) by the LRU trim when the plain cache exceeds 400 MiB.
- Neither the share flow nor app backgrounding deletes it.

**How long the receiving app needs the file:**
- `shareAsync` resolves when the chooser activity returns (`OnActivityResult`). That does **not**
  mean the target has finished reading.
- Several common targets read the `content://` URI **lazily**: mail apps on send, Drive or LINE
  uploading in the background, apps that return before copying.
- The URI grant made by `grantUriPermission` stays valid until it is revoked or the device reboots.
- So deleting the file immediately after `shareAsync` resolves **would break some shares**.

**Exposure window:**
- From the share until the next cold start of OneScan, which can be **days** if the process stays
  alive.
- During that window the plaintext sits in app-private storage. Readable by:
  - OneScan itself;
  - the apps granted the URI (they were already given the content by the user's action);
  - root / forensic access.
- Backup is disabled, so it does not leave the device that way.
- **Lower severity than the OCR copy**, but unbounded in time.

**Recommended minimal fix (patch plan only, not implemented):**
1. Put share copies in their own folder, `plain/share/<uuid>/<Title>.pdf`, instead of the reusable
   `plain/<sha1>/` copy. That keeps OCR / viewer copies and share copies apart, and a share copy is
   never reused.
2. Give share copies a **TTL**: delete `plain/share/*` (and `plain/export-*`) older than **N minutes**
   (proposal: 30 min; Owner decides).
   - Run the sweep on app foreground (`AppState` → active), at the next share, and at launch (launch
     already clears everything).
   - On delete, revoke the URI grant (`revokeUriPermission`).
3. Tests:
   - HOST: unit test for the sweep with a fake clock and folders.
   - REAL DEVICE: share to Gmail (send later), Drive (background upload), LINE and Files, each after
     the TTL, to confirm sharing still works. The receiving apps that copy at send time are fine; any
     that read after the TTL would fail, and that defines N.

**Change size:**
- About one native function or a JS sweep in `DocumentFileStore` / bootstrap, plus a separate name
  path for share copies.
- No crypto or storage-architecture change.

**Not proposed now:**
- A streaming `ContentProvider` that decrypts on demand would remove the file entirely. It is a
  larger native change, so it is listed for later.

**Before Production?**
- Recommendation: **yes, include the TTL fix in the next RC.** The next RC must be rebuilt for
  `d1cbb22` anyway, and the fix is small.
- Severity: P2 security hardening, not P0. The Owner decides whether it blocks.

## Version control (no change made)

| Record (`apk-builds`) | versionCode |
|---|---|
| 1.2.0 RC1 | 11 |
| RC2–RC4 | 12 |
| **1.2.0 Production AAB** | **13** |
| 1.3 V3 Device Preview, Account Preview, Doc Tools A/B previews | **13** (upload-key signed, sideloaded) |

- Play Console history: **UNKNOWN**. No access from here; `RELEASE-1.2.0.md` itself asks the Owner
  to confirm in Play Console that nothing ≥ 13 was uploaded.
- **13 is used in at least two signed artifacts, so treat it as taken.** Any new release candidate
  must be **≥ 14**, after the Owner confirms against Play Console.
- app.json (12) was not changed in this round.

## Release blockers (all open; none started)

| # | Blocker | Owner action |
|---|---|---|
| 1 | **Exposed credential:** Neon `DATABASE_URL` in git history | Rotate it; then decide whether to remove the file and purge history |
| 2 | **`d1cbb22` real Android QA not done** (no device here) | Approve a debug QA APK + run the runbook on a phone |
| 3 | **No recorded real-device QA of any release build** (RC4 sheet blank) | Run the smoke test + full sheet on the chosen RC |
| 4 | **Share plaintext lifetime** (unbounded until next launch) | Approve / reject the TTL patch plan and choose N |
| 5 | **KNOWN RELEASE BLOCKER — feature flags:** `advancedPdf` and `convert` are declared production-off but not enforced (1.3 tools visible); account routes are deep-linkable while account is off | Decide the intended behaviour |
| 6 | **Release base not chosen:** 1.2.0 (`78c0121`) + `d1cbb22` cherry-pick, or the 1.3 line (`f744530`) — the latter adds blockers 5, account deploy, M1/M2 | Choose |
| 7 | **versionCode:** confirm Play Console history; next RC ≥ 14 | Confirm |
| 8 | Play listing / Data safety form not recorded | Prepare |

## Final question: is OneScan ready to create a new Production Release Candidate?

**NO-GO**

**Reasons:**
- A real credential is exposed in the repository and must be rotated first (your stop-before-build
  rule).
- The OCR temp fix `d1cbb22` has **no real Android QA**; this container has no device.
- No release build has recorded real-device QA.
- The release-gating behaviour (advancedPdf / convert / account deep link) and the release base are
  undecided.

**Status:** OneScan Security Release Gate — READY FOR OWNER DECISION.
