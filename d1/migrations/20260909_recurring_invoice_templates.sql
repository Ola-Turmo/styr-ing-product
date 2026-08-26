CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL, invoice_number_prefix TEXT NOT NULL DEFAULT 'RE',
  description TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1,
  unit_price_minor INTEGER NOT NULL, vat_rate REAL NOT NULL DEFAULT 25,
  vat_code TEXT, interval TEXT NOT NULL DEFAULT 'month' CHECK(interval IN ('month','quarter','year')),
  next_issue_date TEXT NOT NULL, due_days INTEGER NOT NULL DEFAULT 14,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled')),
  currency TEXT NOT NULL DEFAULT 'NOK', created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_templates_board ON recurring_invoice_templates(board_id,status,next_issue_date);
CREATE TABLE IF NOT EXISTS recurring_invoice_generations (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES recurring_invoice_templates(id) ON DELETE CASCADE,
  issue_date TEXT NOT NULL, sales_invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(template_id,issue_date), UNIQUE(sales_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_recurring_invoice_generations_board ON recurring_invoice_generations(board_id,created_at);
