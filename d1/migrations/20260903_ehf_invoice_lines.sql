ALTER TABLE ehf_documents ADD COLUMN vat_minor INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ehf_document_lines (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ehf_document_id TEXT NOT NULL REFERENCES ehf_documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  vat_rate INTEGER NOT NULL DEFAULT 0 CHECK(vat_rate IN (0,15,25)),
  vat_code TEXT,
  net_minor INTEGER NOT NULL,
  vat_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ehf_document_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_ehf_document_lines_document ON ehf_document_lines(board_id,ehf_document_id,line_number);
