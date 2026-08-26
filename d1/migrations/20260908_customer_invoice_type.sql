-- Allow Norwegian SMBs to invoice private customers without an organization number.
ALTER TABLE customer_invoice_profiles ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'business' CHECK(customer_type IN ('business','private'));
