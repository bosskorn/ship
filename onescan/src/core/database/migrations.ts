/**
 * Local database schema (device only). Document *content* lives in files under
 * the app sandbox; the DB stores metadata and the local OCR index.
 * `workspace_id` is reserved for future Business workspaces (spec §55).
 */
export const migrations: string[] = [
  /* v1 */ `
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    system_key TEXT,
    workspace_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS folders_system_key ON folders(system_key) WHERE system_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'document',
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    workspace_id TEXT,
    page_count INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    pdf_uri TEXT,
    thumbnail_uri TEXT,
    has_sensitive INTEGER NOT NULL DEFAULT 0,
    is_redacted_copy INTEGER NOT NULL DEFAULT 0,
    source_document_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    opened_at INTEGER,
    deleted_at INTEGER,
    sync_state TEXT NOT NULL DEFAULT 'local_only'
  );
  CREATE INDEX IF NOT EXISTS documents_updated ON documents(updated_at DESC);
  CREATE INDEX IF NOT EXISTS documents_folder ON documents(folder_id);
  CREATE INDEX IF NOT EXISTS documents_deleted ON documents(deleted_at);

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_index INTEGER NOT NULL,
    image_uri TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    filter TEXT NOT NULL DEFAULT 'auto',
    rotation INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS pages_document ON pages(document_id, page_index);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS document_tags (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
    document_id UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TABLE IF NOT EXISTS ai_permissions (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    redacted INTEGER NOT NULL,
    granted_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    document_id TEXT PRIMARY KEY NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    remote_object_id TEXT,
    state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  /* v2 — non-destructive pages: original capture, preview render and edit parameters */ `
  ALTER TABLE pages ADD COLUMN source_uri TEXT;
  ALTER TABLE pages ADD COLUMN preview_uri TEXT;
  ALTER TABLE pages ADD COLUMN quad TEXT;
  `,
];
