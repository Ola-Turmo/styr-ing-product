-- Add the Norwegian organization number to customer invoice profiles.
-- Kept separate so databases that already ran 20260906 are upgraded safely.
ALTER TABLE customer_invoice_profiles ADD COLUMN org_number TEXT;
