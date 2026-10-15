---
name: onescan-secure-documents
description: OneScan's approved document security architecture - AES-256-GCM file encryption (SecureFiles, format OSE1), Android Keystore KEK + wrapped DEK, SQLCipher database key, encrypted document store layout, plain cache and plaintext lifetime, migration of legacy plaintext, share/print/export boundaries, backup exclusion, cloud/AI gates. Use for any change that reads, writes, decrypts, exports or deletes document content or the database. Pair with onescan-temp-file-safety for any temp/plaintext file.
---

# OneScan — secure documents

The architecture is **approved and frozen**. Do not redesign it. Paths below are relative to
`onescan/`. `K/` means `modules/onescan-vision/android/src/main/java/app/onescan/vision/`.

## Principles
- **Plaintext lifetime = minimum necessary.**
- No implicit path may send document content off the device: no upload, cloud OCR, analytics
  payload or crash-report attachment.
- Prefer streaming (`decryptTo`) over a plaintext file. Prefer a call-scoped plaintext file over the
  shared plain cache.

## Workflow (mandatory)
READ BASELINE → LOCATE (map below) → CHECK STATUS (pending items below) → MINIMAL CHANGE →
IMPLEMENT → TEST (failure paths too) → REPORT → STOP.

## Architecture (current, Android)
- **File format** (`K/SecureFiles.kt`):
  - Magic `OSE1`, then records `[flag u8][len u32][iv 12][ct+tag 16]`.
  - At most 1 MiB of plaintext per record; AES/GCM/NoPadding, 128-bit tag.
  - AAD = record index (4 bytes BE) + flag. The last record has flag 1.
  - Decrypt rejects bad magic, bad length, truncation and trailing bytes.
- **Keys:**
  - KEK: Android Keystore AES-256-GCM, alias `onescan.kek.v1`, non-exportable.
  - DEK: 32 random bytes, wrapped by the KEK, stored at `filesDir/onescan-keys/dek.v1`
    (tmp + rename).
  - A missing KEK with an existing DEK throws `KeyLostException`. It never silently regenerates.
- **Database:**
  - SQLCipher (`app.json` `useSQLCipher:true`).
  - Key = `databaseKeyHex()` = HMAC-SHA256(DEK, "onescan-sqlcipher-v1"), applied in
    `src/core/database/db.ts` via `PRAGMA key`.
  - Legacy plaintext DB → `encryptLegacyDatabase` (`sqlcipher_export`, row-count verify, marker,
    swap).
- **Write paths:**
  - `encrypt` writes `.enc.tmp` then renames; an already-encrypted source is byte-copied.
  - `decrypt` writes `.dec.tmp` then renames; the tmp is deleted on error.
  - `migrate` writes `.mig.tmp`, verifies the SHA-256 round trip, then renames.
- **Document store** (`src/core/document-engine/storage/DocumentFileStore.ts`):
  - Layout: `<documents>/onescan/docs/<docId>/{original,processed,preview,thumbnail}/`,
    `document.pdf`.
  - Drafts: `<cache>/onescan/drafts/<sessionId>`.
  - `adopt()` encrypts natively and does not delete the source.
- **Startup** (`src/features/shared/bootstrap.ts`):
  1. `plainCacheReady()` clears the last launch's plain cache.
  2. `cleanCache` deletes `cache/onescan` entries older than 10 min, skipping `plain/`.
  3. `emptyExpiredTrash`.
  4. `sweepOrphanFolders`.
  5. `encryptExistingFiles` deletes stale `*.enc|dec|mig.tmp` and migrates.
- **Plain cache:**
  - Location `cacheDir/onescan/plain`.
  - `SecureFiles.plain()` decrypts into it, keyed by sha1(path|len|mtime), and reuses copies.
  - LRU trim at 400 MiB. The trim **does not know which copies are in use**.
  - Cleared on the first document read of each launch.
- **Readers:** every native reader goes through `ImageIO.fileFromUri` = `SecureFiles.plain(...)`.
  - Readers: grayscale, processPage, resize, imageInfo, writePdf, recognizeText, redact, renderPdf,
    pdfPageCount, renderPdfPages.
  - `printPdfAsync` streams with `decryptTo` (no file).
- **Native outputs are plaintext** in `cacheDir/onescan` until JS calls `encryptFileAsync` / `adopt`.
- **Backup:** `plugins/withPrivacyHardening.js` sets `allowBackup=false`, `fullBackupContent=false`,
  and data-extraction rules that exclude every domain.
- **Network gates:**
  - Cloud: `syncPolicy.canUpload` (encrypted only, opt-in), then `vaultCrypto` (separate key in
    expo-secure-store). No adapters are registered.
  - AI: `aiPolicy.prepareAiPayload` (consent, redaction).
  - In release, `PRODUCTION_OFF` disables ai, cloudBackup, externalCloud and others.

## Known gaps — record them, do not silently fix (fixing needs a task)
| Gap | Status |
|---|---|
| OCR decrypts into the shared plain cache | Fix exists on `claude/ocr-temp-cleanup` `d1cbb22` (`withPlainTemp`): code review + host regression passed, **awaiting real Android QA, NOT merged**. Do not merge or re-implement; do not redo its review |
| Share PDF / image share | Leaves the plaintext copy in `plain/` until next launch or the LRU trim |
| LRU trim may delete a copy that is being read | Open |
| **iOS** | No file encryption and no SQLCipher key (native functions absent → plaintext fallback). Android is the secured platform |
| `DocumentScanner` / camera outputs | Plaintext until adopted. Drafts are cleaned by `cleanCache` (>10 min) |

## Rules
- Never write document content outside app-private storage, except through a user-initiated
  export, share or print (SAF picker, share sheet, print spooler).
- Never log document content, OCR text, file contents, keys or key-derived values.
- Any new reader of document files must:
  - be added to `READS_DOCUMENT_FILES` (gated by `plainCacheReady`), and
  - use the narrowest plaintext form (stream > scoped temp > plain cache).
- Never weaken a decrypt check, the key-loss behaviour or the backup rules.
- Crypto changes (format, key derivation, algorithms) are architecture changes and need an Owner
  decision.

## Tests
- **HOST:**
  - `SecureFilesTest.kt`: round trip at 0 B–3 MiB, tamper, truncation, migrate, `plainLength`,
    print streaming.
  - `printNoPlaintext.test.ts`, `imageExport.test.ts`, `privacyGuards.test.ts`,
    `productionGate.test.ts`.
  - Not covered on host: `plain()`, the trim, `clearPlainCache` and the Keystore path, because the
    Keystore needs a device.
- **Keystore, backup and on-disk residue checks are REAL DEVICE** (or emulator, labelled).
  Use the `onescan-temp-file-safety` checklist.
