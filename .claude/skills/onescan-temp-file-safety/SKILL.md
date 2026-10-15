---
name: onescan-temp-file-safety
description: Security checklist for every temporary or plaintext file in OneScan (decrypted copies, capture/scan outputs, PDF/image renders, export/share files, .tmp files). Forces a CREATE -> USE -> CLOSE -> DELETE audit across success, exception, cancellation, interruption, process death and stale cleanup. Use whenever code creates, decrypts, renames or deletes a file, and when reviewing such code. Happy-path tests are not enough.
---

# OneScan — temp-file safety

Load together with `onescan-secure-documents`. This skill is a checklist, not an architecture.

## Lifecycle audit (fill this in for EVERY file the change creates)

| Step | Question to answer with file:line evidence |
|---|---|
| CREATE | Where exactly? Must be app-private: `cacheDir/onescan/...` or `filesDir`, never external or shared storage. Name unpredictable (UUID) and collision-free under concurrency? Plaintext or encrypted? |
| USE | Who reads it, for how long? Can another component (LRU trim, `cleanCache`, a second call) delete or overwrite it while in use? |
| CLOSE | Every stream / Bitmap / PdfRenderer / ParcelFileDescriptor closed in `finally` / `use {}`? |
| DELETE | Deleted where? In `finally`, or by whom and when? What is the maximum time plaintext can stay on disk? |

## Failure paths that must be covered
1. **Success:** the file is gone (or encrypted) when the operation returns.
2. **Exception** inside USE (decode error, OOM, Tesseract failure, disk full / ENOSPC): the file is
   still deleted.
3. **Cancellation:**
   - JS gave up (timeout via `withTimeout` / `Promise.race`, the user cancelled) while native still
     runs. Native code must still clean up when it finishes. A JS timeout does **not** stop native
     work.
   - Cancellation checkpoints: `src/core/document-engine/cancel.ts`.
4. **Interruption:** `InterruptedException` or a coroutine/executor shutdown — `finally` still runs.
5. **Process death** (kill, crash, OOM-kill, ANR kill), where `finally` does NOT run:
   - The plaintext must sit in a location wiped at the next start:
     - `cacheDir/onescan/plain` is cleared by `plainCacheReady()` before the first document read.
     - `cacheDir/onescan/*` older than 10 min goes to `cleanCache`.
     - `*.enc|dec|mig.tmp` goes to `encryptExistingFiles`.
   - Say which of these covers the new file. If none does, the change is not safe.
6. **Stale cleanup:**
   - Does the startup sweep match the new file's name or location?
   - Can the sweep delete something still needed (e.g. drafts in use)?
7. **Partial writes:** write to `*.tmp` then rename. A failed write deletes the tmp. Readers never
   see a half-written file.
8. **Encrypted inputs:** never delete the caller's file. A plaintext pass-through must not be
   deleted either.

## Reference implementation (exists, not merged)
`SecureFiles.withPlainTemp(file, dir?) { block }` on branch `claude/ocr-temp-cleanup` `d1cbb22`:
- Decrypts into a UUID file under `plain/scoped/` and deletes it in `finally`.
- Plaintext inputs pass through.
- The trim skips `scoped/`.
- Tests: `PlainTempTest.kt` (6 cases).

Status: code review + host regression **PASSED**, awaiting real Android QA, **not merged** — do not
merge it, redo its review, or re-implement it elsewhere. Reuse the pattern only in a task the Owner
approves.

## Test requirements
A change is not done until the tests prove, for each failure path above that applies, that **no
plaintext file remains**:
- **HOST:** JVM tests with `SecureFiles.useKeyForTests` and a temp dir. Count files after success /
  throw / interrupt / tamper / concurrent calls.
- **REAL DEVICE:**
  - Inspect `adb shell run-as app.onescan.mobile find cache files -type f` before, during and after;
    after an error; after cancel; and after `am kill` / force-stop mid-operation, then relaunch.
  - Report the paths and counts.

Never report "safe" because the happy path passed. Label every result HOST / EMULATOR / REAL DEVICE.

## Never
- Write plaintext to external storage, `Download/`, or a world-readable location.
- Log file paths that contain document titles, or file contents.
- Rely on `deleteOnExit()` or on the OS clearing the cache.
