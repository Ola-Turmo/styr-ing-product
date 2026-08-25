-- Additive EHF/PEPPOL invoice inbox.
CREATE TABLE IF NOT EXISTS ehf_documents (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  document_ref TEXT NOT NULL, standard TEXT NOT NULL DEFAULT 'EHF 3.0', profile TEXT,
  supplier_name TEXT NOT NULL, supplier_org_number TEXT, invoice_number TEXT NOT NULL,
  issue_date TEXT NOT NULL, due_date TEXT NOT NULL, amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NOK', source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','peppol','upload')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','validated','rejected','linked')),
  validation_errors TEXT, supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  external_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(external_status IN ('not_configured','ready','sent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), validated_at TEXT,
  UNIQUE(board_id,document_ref)
);
CREATE INDEX IF NOT EXISTS idx_ehf_documents_board ON ehf_documents(board_id,status,created_at);
