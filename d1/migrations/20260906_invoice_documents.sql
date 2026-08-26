-- Reusable seller/customer invoice details and immutable approved document snapshots.
CREATE TABLE IF NOT EXISTS accounting_profiles (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  org_number TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'NO',
  email TEXT,
  bank_account TEXT NOT NULL,
  vat_registered INTEGER NOT NULL DEFAULT 0 CHECK(vat_registered IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_invoice_profiles (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  address_line1 TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'NO',
  email TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(board_id,account_id)
);

CREATE TABLE IF NOT EXISTS sales_invoice_documents (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  sales_invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','void')),
  payload TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id,sales_invoice_id,version),
  UNIQUE(board_id,checksum)
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_documents_invoice ON sales_invoice_documents(board_id,sales_invoice_id,status);
