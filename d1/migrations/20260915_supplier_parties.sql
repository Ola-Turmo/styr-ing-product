-- Reusable supplier master data for the everyday procure-to-pay flow.
-- Existing invoices and orders remain valid; the link is additive and nullable.
CREATE TABLE IF NOT EXISTS supplier_parties (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_number TEXT,
  address_line1 TEXT,
  postal_code TEXT,
  city TEXT,
  country_code TEXT NOT NULL DEFAULT 'NO',
  email TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 14 CHECK(payment_terms_days BETWEEN 0 AND 365),
  default_expense_account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(board_id,org_number)
);
CREATE INDEX IF NOT EXISTS idx_supplier_parties_board ON supplier_parties(board_id,active,name);
ALTER TABLE purchase_orders ADD COLUMN supplier_party_id TEXT;
ALTER TABLE supplier_invoices ADD COLUMN supplier_party_id TEXT;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_party ON purchase_orders(board_id,supplier_party_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_party ON supplier_invoices(board_id,supplier_party_id);
