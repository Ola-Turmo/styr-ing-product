-- Separate attestasjon (invoice control) from anvisning (payment authority).
ALTER TABLE supplier_invoices ADD COLUMN attested_by TEXT;
ALTER TABLE supplier_invoices ADD COLUMN attested_at TEXT;
ALTER TABLE supplier_invoices ADD COLUMN assigned_by TEXT;
ALTER TABLE supplier_invoices ADD COLUMN assigned_at TEXT;
