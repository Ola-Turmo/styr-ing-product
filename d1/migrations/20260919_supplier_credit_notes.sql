-- Supplier credit notes are controlled reductions of approved supplier invoices.
CREATE TABLE IF NOT EXISTS supplier_credit_notes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  credit_note_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  vat_minor INTEGER NOT NULL DEFAULT 0 CHECK(vat_minor >= 0),
  total_minor INTEGER NOT NULL CHECK(total_minor > 0),
  currency TEXT NOT NULL DEFAULT 'NOK',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','posted','cancelled')),
  approved_by TEXT,
  approved_at TEXT,
  posted_voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(board_id,credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_notes_board ON supplier_credit_notes(board_id,status,issue_date);
CREATE TABLE IF NOT EXISTS supplier_credit_note_posting_proposals (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  supplier_credit_note_id TEXT NOT NULL REFERENCES supplier_credit_notes(id) ON DELETE RESTRICT,
  period TEXT NOT NULL,
  voucher_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  lines_json TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','posted','rejected')),
  voucher_id TEXT REFERENCES vouchers(id) ON DELETE SET NULL,
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  posted_by TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(board_id,supplier_credit_note_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_note_posting_board ON supplier_credit_note_posting_proposals(board_id,status,period,created_at);
