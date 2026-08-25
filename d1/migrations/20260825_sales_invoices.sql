CREATE TABLE IF NOT EXISTS sales_invoices (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL, invoice_number TEXT NOT NULL,
  issue_date TEXT NOT NULL, due_date TEXT, description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0, vat_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NOK', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','sent','paid','overdue','cancelled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','project','subscription','quote')),
  approved_by TEXT, approved_at TEXT, paid_at TEXT, payment_reference TEXT,
  external_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(external_status IN ('not_configured','ready','sent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT,
  UNIQUE(board_id,invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_board ON sales_invoices(board_id,status,due_date);
