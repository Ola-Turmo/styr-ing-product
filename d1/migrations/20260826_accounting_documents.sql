-- Tenant-scoped document metadata. Binary content is held in the R2 bucket.
CREATE TABLE IF NOT EXISTS accounting_documents (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_documents_board ON accounting_documents(board_id,created_at);
CREATE INDEX IF NOT EXISTS idx_accounting_documents_entity ON accounting_documents(board_id,entity_type,entity_id);
