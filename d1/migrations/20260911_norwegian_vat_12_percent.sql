-- Norwegian reduced VAT rates include 12 percent (transport, accommodation,
-- cinema and related services). Rebuild the two line tables so their database
-- constraints match the API/UI validation and preserve existing rows.

DROP TABLE IF EXISTS supplier_invoice_lines_new_20260911;
CREATE TABLE supplier_invoice_lines_new_20260911 (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  vat_rate INTEGER NOT NULL DEFAULT 0 CHECK(vat_rate IN (0,12,15,25)),
  vat_code TEXT,
  net_minor INTEGER NOT NULL,
  vat_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(supplier_invoice_id,line_number)
);
INSERT INTO supplier_invoice_lines_new_20260911 (id,board_id,supplier_invoice_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id,created_at)
SELECT id,board_id,supplier_invoice_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id,created_at
FROM supplier_invoice_lines;
DROP TABLE supplier_invoice_lines;
ALTER TABLE supplier_invoice_lines_new_20260911 RENAME TO supplier_invoice_lines;
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_invoice ON supplier_invoice_lines(board_id,supplier_invoice_id,line_number);

DROP TABLE IF EXISTS ehf_document_lines_new_20260911;
CREATE TABLE ehf_document_lines_new_20260911 (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ehf_document_id TEXT NOT NULL REFERENCES ehf_documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  vat_rate INTEGER NOT NULL DEFAULT 0 CHECK(vat_rate IN (0,12,15,25)),
  vat_code TEXT,
  net_minor INTEGER NOT NULL,
  vat_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  account_id TEXT REFERENCES ledger_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ehf_document_id,line_number)
);
INSERT INTO ehf_document_lines_new_20260911 (id,board_id,ehf_document_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id,created_at)
SELECT id,board_id,ehf_document_id,line_number,description,quantity,unit_price_minor,vat_rate,vat_code,net_minor,vat_minor,total_minor,account_id,created_at
FROM ehf_document_lines;
DROP TABLE ehf_document_lines;
ALTER TABLE ehf_document_lines_new_20260911 RENAME TO ehf_document_lines;
CREATE INDEX IF NOT EXISTS idx_ehf_document_lines_document ON ehf_document_lines(board_id,ehf_document_id,line_number);
