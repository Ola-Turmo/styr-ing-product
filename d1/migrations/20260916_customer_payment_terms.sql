-- Reusable customer payment terms for invoice due-date defaults.
ALTER TABLE customer_invoice_profiles ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 14 CHECK(payment_terms_days BETWEEN 0 AND 365);
