-- Manual payment recording for supplier invoices. No payment provider or bank
-- adapter is activated by this migration.
ALTER TABLE supplier_invoices ADD COLUMN paid_at TEXT;
ALTER TABLE supplier_invoices ADD COLUMN payment_reference TEXT;
