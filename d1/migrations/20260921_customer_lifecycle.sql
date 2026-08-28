-- Keep customer lifecycle separate from CRM pipeline stage so archiving never rewrites accounting history.
ALTER TABLE crm_accounts ADD COLUMN customer_status TEXT NOT NULL DEFAULT 'active' CHECK(customer_status IN ('active','archived'));
CREATE INDEX IF NOT EXISTS idx_crm_accounts_customer_status ON crm_accounts(board_id,customer_status);
