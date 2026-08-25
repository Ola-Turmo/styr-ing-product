-- Line-level sales invoice control: product/service, account and Norwegian VAT rate.
CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  sales_invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_minor INTEGER NOT NULL,
  vat_rate REAL NOT NULL DEFAULT 0,
  vat_code TEXT,
  net_minor INTEGER NOT NULL,
  vat_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL,
  account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sales_invoice_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice ON sales_invoice_lines(board_id,sales_invoice_id,line_number);
