import { Directory, File, Paths } from 'expo-file-system';
import { OneScanVision } from '@/native/OneScanVision';

/**
 * Sandboxed, device-local file layout:
 *   <documents>/onescan/docs/<docId>/
 *       original/page-<n>.jpg    scanner/camera JPEG, byte-for-byte (source of re-renders)
 *       processed/page-<n>.jpg   full-resolution master (viewer zoom, PDF, export)
 *       preview/page-<n>.jpg     ~1600 px for on-screen display
 *       thumbnail/thumb.jpg      ~400 px for the document list
 *       document.pdf             built from the masters
 *   (documents saved before 1.0.5: page-<n>.jpg + thumb.jpg in the root)
 *   <cache>/onescan/drafts/<sessionId>/…  (unsaved scans; OS may purge)
 * Files here are excluded from any automatic upload.
 */
function ensure(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const DocumentFileStore = {
  docDir(docId: string): Directory {
    return ensure(new Directory(Paths.document, 'onescan', 'docs', docId));
  },

  draftDir(sessionId: string): Directory {
    return ensure(new Directory(Paths.cache, 'onescan', 'drafts', sessionId));
  },

  /**
   * Copy a file into a document folder under a stable name (may include one subfolder).
   * With the native module the copy is encrypted at rest (AES-256-GCM, Keystore-wrapped
   * key — see SecureFiles.kt); readers get a decrypted cache copy via `readableUri`.
   */
  async adopt(sourceUri: string, docId: string, name: string): Promise<File> {
    const slash = name.lastIndexOf('/');
    const dir = slash > 0 ? ensure(new Directory(this.docDir(docId), name.slice(0, slash))) : this.docDir(docId);
    const target = new File(dir, name.slice(slash + 1));
    if (OneScanVision?.encryptFileAsync) {
      await OneScanVision.encryptFileAsync(sourceUri, target.uri);
      return target;
    }
    if (target.exists) target.delete();
    new File(sourceUri).copySync(target);
    return target;
  },

  /** A URI other components can read (decrypted cache copy for encrypted files). */
  async readableUri(uri: string, name?: string): Promise<string> {
    if (!OneScanVision?.plainUriAsync) return uri;
    return OneScanVision.plainUriAsync(uri, name ?? null);
  },

  /**
   * Bytes a document occupies on this device: every file in its folder (encrypted at rest).
   * Walks one document's folder only, on demand (Document info) — never for a list.
   */
  storageBytes(pdfUri: string | null): number {
    const id = pdfUri?.match(/docs\/([^/]+)\//)?.[1];
    if (!id) return 0;
    const walk = (d: Directory): number =>
      d.list().reduce((n, e) => n + (e instanceof Directory ? walk(e) : ((e as File).size ?? 0)), 0);
    const dir = new Directory(Paths.document, 'onescan', 'docs', id);
    return dir.exists ? walk(dir) : 0;
  },

  /** The PDF's real size (decrypted size of an encrypted file, computed from its length). */
  async contentBytes(uri: string): Promise<number> {
    if (OneScanVision?.plainSizeAsync) return OneScanVision.plainSizeAsync(uri);
    return this.size(uri);
  },

  size(uri: string): number {
    const f = new File(uri);
    return f.exists ? f.size : 0;
  },

  async readBase64(uri: string): Promise<string> {
    return new File(uri).base64();
  },

  deleteDocument(docId: string) {
    const dir = new Directory(Paths.document, 'onescan', 'docs', docId);
    if (dir.exists) dir.delete();
  },

  deleteDraft(sessionId: string) {
    const dir = new Directory(Paths.cache, 'onescan', 'drafts', sessionId);
    if (dir.exists) dir.delete();
  },
};
