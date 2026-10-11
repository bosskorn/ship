import { Directory, File, Paths } from 'expo-file-system';

/**
 * Sandboxed, device-local file layout:
 *   <documents>/onescan/docs/<docId>/page-<n>.jpg | document.pdf | thumb.jpg
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

  /** Copy a file into a document folder under a stable name; returns its URI. */
  adopt(sourceUri: string, docId: string, name: string): File {
    const target = new File(this.docDir(docId), name);
    if (target.exists) target.delete();
    new File(sourceUri).copySync(target);
    return target;
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
