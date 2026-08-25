ALTER TABLE supplier_invoices ADD COLUMN vat_minor INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
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
  UNIQUE(supplier_invoice_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_invoice ON supplier_invoice_lines(board_id,supplier_invoice_id,line_number);
