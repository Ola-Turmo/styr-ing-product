-- Reusable goods and services for small-business sales invoicing.
CREATE TABLE IF NOT EXISTS product_services (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
  vat_rate INTEGER NOT NULL DEFAULT 25 CHECK(vat_rate IN (0,12,15,25)),
  revenue_account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(board_id,sku)
);
CREATE INDEX IF NOT EXISTS idx_product_services_board ON product_services(board_id,active,name);
