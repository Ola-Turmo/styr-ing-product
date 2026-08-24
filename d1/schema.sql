-- Styr.ing D1 Database Schema
-- Norwegian Board Portal — Cloudflare D1 (SQLite)
-- Run: wrangler d1 execute styr-ing-db --file=d1/schema.sql --remote

-- Boards (each board = one paying customer)
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  org_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived','pilot')),
  plan TEXT NOT NULL DEFAULT 'pilot' CHECK(plan IN ('pilot','paid','enterprise')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Board members with roles
CREATE TABLE IF NOT EXISTS board_members (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('leader','deputy','member','observer','secretary')),
  since TEXT,
  until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Meetings
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','ongoing','completed','cancelled')),
  agenda TEXT,
  minutes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Meeting documents
CREATE TABLE IF NOT EXISTS meeting_documents (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compliance events (regulatory deadlines)
CREATE TABLE IF NOT EXISTS compliance_events (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deadline TEXT NOT NULL,
  authority TEXT,
  type TEXT NOT NULL CHECK(type IN ('annual','privacy','compliance','esg','financial','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','waived')),
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Internal control items (COSO framework)
CREATE TABLE IF NOT EXISTS control_items (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner TEXT,
  frequency TEXT,
  status TEXT NOT NULL DEFAULT 'green' CHECK(status IN ('green','yellow','red')),
  last_review TEXT,
  notes TEXT,
  category TEXT CHECK(category IN ('control_environment','risk_assessment','control_activities','information','monitoring')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Control evidence (attachments for control items)
CREATE TABLE IF NOT EXISTS control_evidence (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL REFERENCES control_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  notes TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users (authentication — simple email/password for MVP, migrate to Clerk/Ory later)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','superadmin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

-- Board-user memberships
CREATE TABLE IF NOT EXISTS user_boards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('owner','editor','viewer')),
  PRIMARY KEY (user_id, board_id)
);

-- API keys for service accounts / integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT 'read',
  board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  last_used TEXT
);

-- Demo requests (lead capture from landing page)
CREATE TABLE IF NOT EXISTS demo_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  board TEXT,
  employees TEXT,
  message TEXT,
  source TEXT DEFAULT 'website',
  status TEXT DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','converted','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  board_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_boards_company ON boards(company_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board ON board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_meetings_board ON meetings(board_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_meeting_documents_meeting ON meeting_documents(meeting_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_board ON compliance_events(board_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_deadline ON compliance_events(deadline);
CREATE INDEX IF NOT EXISTS idx_control_items_board ON control_items(board_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_board ON audit_log(board_id);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);

-- PRD operating-system extensions. These tables keep operational state separate
-- from the public static preview and are safe to create repeatedly in D1.
CREATE TABLE IF NOT EXISTS risks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('critical','high','medium','low')),
  trend TEXT NOT NULL DEFAULT 'stable' CHECK(trend IN ('up','down','stable')),
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','treating','monitoring','closed')),
  treatment TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  resolution_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS resolutions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','adopted','signed','rejected')),
  votes_for INTEGER NOT NULL DEFAULT 0,
  votes_against INTEGER NOT NULL DEFAULT 0,
  votes_abstain INTEGER NOT NULL DEFAULT 0,
  signature_status TEXT NOT NULL DEFAULT 'not_required' CHECK(signature_status IN ('not_required','pending','partial','complete')),
  adoption_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS board_documents (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT,
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final','archived')),
  version TEXT NOT NULL DEFAULT '1.0',
  file_url TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_states (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('risk','action','resolution','document','control','agenda','minutes')),
  entity_id TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS api_events (
  id TEXT PRIMARY KEY,
  board_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_drafts (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
  provider TEXT NOT NULL DEFAULT 'rules-based-preview',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_risks_board ON risks(board_id);
CREATE INDEX IF NOT EXISTS idx_actions_board ON action_items(board_id);
CREATE INDEX IF NOT EXISTS idx_resolutions_board ON resolutions(board_id);
CREATE INDEX IF NOT EXISTS idx_documents_board ON board_documents(board_id);
CREATE INDEX IF NOT EXISTS idx_review_states_entity ON review_states(board_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_board ON ai_drafts(board_id, created_at);

-- Unified operating-system domains from PRD v8.
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT, role TEXT, department TEXT, employment_status TEXT NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active','leave','ended')),
  start_date TEXT, manager_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, title TEXT NOT NULL, period TEXT, status TEXT NOT NULL DEFAULT 'on_track' CHECK(status IN ('on_track','at_risk','complete','draft')), progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS it_assets (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL, name TEXT NOT NULL, asset_type TEXT NOT NULL, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','repair','retired')), vendor TEXT, renewal_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS service_tickets (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, category TEXT NOT NULL DEFAULT 'general', priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')), assignee_id TEXT REFERENCES people(id) ON DELETE SET NULL, due_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS finance_records (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK(record_type IN ('invoice','voucher','bank_transaction','payroll','tax','asset','project')), reference TEXT NOT NULL, counterparty TEXT, amount_minor INTEGER, currency TEXT NOT NULL DEFAULT 'NOK', status TEXT NOT NULL DEFAULT 'draft', due_date TEXT, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS crm_accounts (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL, org_number TEXT, stage TEXT NOT NULL DEFAULT 'prospect' CHECK(stage IN ('prospect','qualified','proposal','won','lost')), owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, next_action TEXT, estimated_value_minor INTEGER, currency TEXT NOT NULL DEFAULT 'NOK', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, counterparty TEXT, contract_type TEXT NOT NULL DEFAULT 'supplier', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','active','expired','terminated')), start_date TEXT, end_date TEXT, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, renewal_notice_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sustainability_items (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('hms_incident','carbon_measurement','vendor_due_diligence','sja','safety_round')), title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','complete','closed')), severity TEXT, scope TEXT, value_numeric REAL, value_unit TEXT, due_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS integration_registry (
  id TEXT PRIMARY KEY, board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  key TEXT NOT NULL, display_name TEXT NOT NULL, domain TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','configuration','connected','paused','error')), residency TEXT, last_sync_at TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(board_id,key)
);
CREATE INDEX IF NOT EXISTS idx_people_board ON people(board_id);
CREATE INDEX IF NOT EXISTS idx_goals_board ON goals(board_id);
CREATE INDEX IF NOT EXISTS idx_assets_board ON it_assets(board_id);
CREATE INDEX IF NOT EXISTS idx_tickets_board ON service_tickets(board_id);
CREATE INDEX IF NOT EXISTS idx_finance_board ON finance_records(board_id);
CREATE INDEX IF NOT EXISTS idx_crm_board ON crm_accounts(board_id);
CREATE INDEX IF NOT EXISTS idx_contracts_board ON contracts(board_id);
CREATE INDEX IF NOT EXISTS idx_sustainability_board ON sustainability_items(board_id);
CREATE INDEX IF NOT EXISTS idx_integrations_board ON integration_registry(board_id);

-- Governance, contract review and equity control records.
CREATE TABLE IF NOT EXISTS contract_reviews (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE, review_type TEXT NOT NULL DEFAULT 'renewal' CHECK(review_type IN ('renewal','redline','risk','approval')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','approved','rejected','closed')), owner_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  findings TEXT NOT NULL DEFAULT '[]', decision TEXT, due_date TEXT, reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mandates (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  holder_id TEXT REFERENCES people(id) ON DELETE SET NULL, mandate_type TEXT NOT NULL CHECK(mandate_type IN ('prokura','signing','purchase','bank','board')), scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','suspended','expired')), valid_from TEXT, valid_until TEXT, evidence_ref TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS equity_holders (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  holder_name TEXT NOT NULL, holder_type TEXT NOT NULL DEFAULT 'person' CHECK(holder_type IN ('person','company','option_pool')), shares INTEGER NOT NULL DEFAULT 0, share_class TEXT NOT NULL DEFAULT 'A', ownership_percent REAL NOT NULL DEFAULT 0, vesting_status TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contract_reviews_board ON contract_reviews(board_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_mandates_board ON mandates(board_id,status,valid_until);
CREATE INDEX IF NOT EXISTS idx_equity_holders_board ON equity_holders(board_id,holder_name);

-- Norwegian accounting core: balanced vouchers, immutable numbering and period locks.
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, account_type TEXT NOT NULL CHECK(account_type IN ('asset','liability','equity','revenue','expense')),
  vat_code TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, code)
);
CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', locked_by TEXT, locked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, period)
);
CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  voucher_number INTEGER NOT NULL, voucher_date TEXT NOT NULL, period TEXT NOT NULL, description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'posted', external_reference TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(board_id, voucher_number)
);
CREATE TABLE IF NOT EXISTS voucher_lines (
  id TEXT PRIMARY KEY, voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  description TEXT, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0, vat_code TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(debit_minor >= 0 AND credit_minor >= 0), CHECK(NOT (debit_minor > 0 AND credit_minor > 0))
);
CREATE TABLE IF NOT EXISTS saf_t_exports (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, period_from TEXT NOT NULL, period_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared', row_count INTEGER NOT NULL DEFAULT 0, checksum TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_board ON ledger_accounts(board_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_board ON accounting_periods(board_id, period);
CREATE INDEX IF NOT EXISTS idx_vouchers_board_date ON vouchers(board_id, voucher_date);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_saf_t_exports_board ON saf_t_exports(board_id, created_at);

-- HCM, talent, handbook and learning workflows.
CREATE TABLE IF NOT EXISTS job_requisitions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, department TEXT, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','paused','closed')),
  employment_type TEXT NOT NULL DEFAULT 'full_time', location TEXT, description TEXT, opened_at TEXT, closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  requisition_id TEXT REFERENCES job_requisitions(id) ON DELETE SET NULL, name TEXT NOT NULL, email TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','screening','interview','offer','hired','rejected')),
  skills TEXT NOT NULL DEFAULT '[]', score INTEGER CHECK(score BETWEEN 0 AND 100), consent_status TEXT NOT NULL DEFAULT 'pending' CHECK(consent_status IN ('pending','granted','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS handbook_documents (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, category TEXT, version TEXT NOT NULL DEFAULT '1.0', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  content TEXT NOT NULL DEFAULT '', requires_ack INTEGER NOT NULL DEFAULT 1, published_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS handbook_acknowledgements (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  handbook_id TEXT NOT NULL REFERENCES handbook_documents(id) ON DELETE CASCADE, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(handbook_id, person_id)
);
CREATE TABLE IF NOT EXISTS training_courses (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL, category TEXT NOT NULL, description TEXT, duration_minutes INTEGER, required INTEGER NOT NULL DEFAULT 1,
  due_days INTEGER NOT NULL DEFAULT 30, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','archived')), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS training_enrollments (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','passed','expired','waived')), due_date TEXT, completed_at TEXT,
  score INTEGER CHECK(score BETWEEN 0 AND 100), UNIQUE(course_id, person_id)
);
CREATE TABLE IF NOT EXISTS performance_reviews (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE, period TEXT NOT NULL, reviewer_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','self_review','manager_review','complete')),
  summary TEXT, rating INTEGER CHECK(rating BETWEEN 1 AND 5), due_date TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(person_id, period)
);
CREATE TABLE IF NOT EXISTS offboarding_cases (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE, last_day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','complete','cancelled')),
  access_revoked INTEGER NOT NULL DEFAULT 0, assets_returned INTEGER NOT NULL DEFAULT 0, payroll_reviewed INTEGER NOT NULL DEFAULT 0,
  notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_requisitions_board ON job_requisitions(board_id, status);
CREATE INDEX IF NOT EXISTS idx_candidates_board ON candidates(board_id, stage);
CREATE INDEX IF NOT EXISTS idx_handbook_board ON handbook_documents(board_id, status);
CREATE INDEX IF NOT EXISTS idx_handbook_ack_board ON handbook_acknowledgements(board_id, person_id);
CREATE INDEX IF NOT EXISTS idx_courses_board ON training_courses(board_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_board ON training_enrollments(board_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_board ON performance_reviews(board_id, period);
CREATE INDEX IF NOT EXISTS idx_offboarding_board ON offboarding_cases(board_id, status);

-- ITSM, asset custody, SaaS spend and access review workflows.
CREATE TABLE IF NOT EXISTS asset_assignments (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES it_assets(id) ON DELETE CASCADE, person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','returned','lost','retired')),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')), returned_at TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL, vendor TEXT NOT NULL, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  seats INTEGER NOT NULL DEFAULT 1, monthly_minor INTEGER, currency TEXT NOT NULL DEFAULT 'NOK',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','trial','cancel_pending','cancelled')),
  renewal_date TEXT, utilization_percent INTEGER CHECK(utilization_percent BETWEEN 0 AND 100), source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS access_reviews (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE, system_name TEXT NOT NULL,
  access_level TEXT, decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','retain','remove','reduce')),
  reviewer_id TEXT REFERENCES people(id) ON DELETE SET NULL, reviewed_at TEXT, reason TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS it_lifecycle_tasks (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  offboarding_case_id TEXT REFERENCES offboarding_cases(id) ON DELETE CASCADE, task_type TEXT NOT NULL,
  title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','in_progress','complete','rejected')),
  requires_approval INTEGER NOT NULL DEFAULT 1, assigned_to TEXT, due_date TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(offboarding_case_id, task_type)
);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_board ON asset_assignments(board_id, status);
CREATE INDEX IF NOT EXISTS idx_saas_board ON saas_subscriptions(board_id, status, renewal_date);
CREATE INDEX IF NOT EXISTS idx_access_reviews_board ON access_reviews(board_id, decision);
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_board ON it_lifecycle_tasks(board_id, status);

-- CRM, CPQ, sales rooms, subscriptions and customer service workflows.
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL, quote_number INTEGER NOT NULL,
  title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','sent','accepted','rejected','expired')),
  currency TEXT NOT NULL DEFAULT 'NOK', subtotal_minor INTEGER NOT NULL DEFAULT 0, discount_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0, valid_until TEXT, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  approval_required INTEGER NOT NULL DEFAULT 1, approved_by TEXT, approved_at TEXT, sent_at TEXT, accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS quote_lines (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unit_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
  revenue_type TEXT NOT NULL DEFAULT 'subscription' CHECK(revenue_type IN ('subscription','one_time','service'))
);
CREATE TABLE IF NOT EXISTS sales_rooms (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL, quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','won','lost','archived')),
  mutual_action_plan TEXT NOT NULL DEFAULT '[]', buyer_contact TEXT, expires_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE, quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','paused','cancelled')),
  recurring_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'NOK', interval TEXT NOT NULL DEFAULT 'month',
  start_date TEXT, renewal_date TEXT, cancelled_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customer_cases (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL, case_number INTEGER NOT NULL,
  title TEXT NOT NULL, description TEXT, channel TEXT NOT NULL DEFAULT 'portal' CHECK(channel IN ('portal','email','phone','internal')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting_customer','resolved','closed')),
  assignee_id TEXT REFERENCES people(id) ON DELETE SET NULL, first_response_due TEXT, resolution_due TEXT, first_responded_at TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_board ON quotes(board_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_rooms_board ON sales_rooms(board_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_board ON customer_subscriptions(board_id, status, renewal_date);
CREATE INDEX IF NOT EXISTS idx_customer_cases_board ON customer_cases(board_id, status, priority);

-- Field operations, fleet, facilities and project accounting workflows.
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  registration TEXT NOT NULL, make_model TEXT NOT NULL, vehicle_type TEXT NOT NULL DEFAULT 'company_car',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','repair','retired')), odometer_km INTEGER NOT NULL DEFAULT 0,
  next_inspection_date TEXT, insurance_renewal_date TEXT, owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS trip_logs (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE, driver_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  trip_date TEXT NOT NULL, start_location TEXT, end_location TEXT, distance_km REAL NOT NULL DEFAULT 0,
  trip_type TEXT NOT NULL DEFAULT 'business' CHECK(trip_type IN ('business','private','commute','unknown')), purpose TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','classified','approved','rejected')),
  tax_basis TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, vehicle_id TEXT NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL CHECK(maintenance_type IN ('inspection','service','insurance','repair')), title TEXT NOT NULL, due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','booked','complete','overdue')), vendor TEXT, cost_minor INTEGER, currency TEXT NOT NULL DEFAULT 'NOK', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, name TEXT NOT NULL, address TEXT, property_type TEXT NOT NULL DEFAULT 'office', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), owner_id TEXT REFERENCES people(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS facility_tasks (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK(task_type IN ('fire_safety','hvac','inspection','maintenance','document')), title TEXT NOT NULL, due_date TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','scheduled','complete','overdue')), assignee_id TEXT REFERENCES people(id) ON DELETE SET NULL, evidence_ref TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, code TEXT NOT NULL, name TEXT NOT NULL, customer_account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','on_hold','complete','cancelled')), billing_model TEXT NOT NULL DEFAULT 'hourly' CHECK(billing_model IN ('hourly','fixed','subscription')), budget_minor INTEGER, currency TEXT NOT NULL DEFAULT 'NOK', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_rates (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, role TEXT NOT NULL, hourly_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'NOK', valid_from TEXT, valid_until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, description TEXT, billable INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','invoiced')), rate_minor INTEGER, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_board ON fleet_vehicles(board_id,status);
CREATE INDEX IF NOT EXISTS idx_trip_logs_board ON trip_logs(board_id,trip_date,status);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_board ON fleet_maintenance(board_id,due_date,status);
CREATE INDEX IF NOT EXISTS idx_facilities_board ON facilities(board_id,status);
CREATE INDEX IF NOT EXISTS idx_facility_tasks_board ON facility_tasks(board_id,due_date,status);
CREATE INDEX IF NOT EXISTS idx_projects_board ON projects(board_id,status);
CREATE INDEX IF NOT EXISTS idx_project_rates_project ON project_rates(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_board ON time_entries(board_id,work_date,status);

-- Payroll, statutory submission preparation, liquidity and collections.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','calculated','review','approved','submitted','closed')),
  gross_minor INTEGER NOT NULL DEFAULT 0, tax_withheld_minor INTEGER NOT NULL DEFAULT 0, employer_cost_minor INTEGER NOT NULL DEFAULT 0,
  holiday_pay_minor INTEGER NOT NULL DEFAULT 0, otp_minor INTEGER NOT NULL DEFAULT 0, employee_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT, approved_by TEXT, approved_at TEXT, submitted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(board_id,period)
);
CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE, gross_minor INTEGER NOT NULL DEFAULT 0, tax_minor INTEGER NOT NULL DEFAULT 0,
  holiday_pay_minor INTEGER NOT NULL DEFAULT 0, otp_minor INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'calculated' CHECK(status IN ('calculated','reviewed','excluded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS compliance_submissions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, submission_type TEXT NOT NULL CHECK(submission_type IN ('a_melding','tax_return','mva','nav_income','annual_accounts')),
  period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','review','approved','submitted','rejected')), payload_hash TEXT, external_reference TEXT,
  approved_by TEXT, approved_at TEXT, submitted_at TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS liquidity_snapshots (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, as_of_date TEXT NOT NULL, cash_minor INTEGER NOT NULL DEFAULT 0,
  receivables_minor INTEGER NOT NULL DEFAULT 0, payables_minor INTEGER NOT NULL DEFAULT 0, payroll_due_minor INTEGER NOT NULL DEFAULT 0, runway_months REAL,
  source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','approved')), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collection_cases (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, account_id TEXT REFERENCES crm_accounts(id) ON DELETE SET NULL,
  reference TEXT NOT NULL, amount_minor INTEGER NOT NULL DEFAULT 0, due_date TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reminder_prepared','reminder_sent','paid','escalated','closed')),
  next_action TEXT, human_approved INTEGER NOT NULL DEFAULT 0, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_board ON payroll_runs(board_id,period,status);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_compliance_submissions_board ON compliance_submissions(board_id,period,status);
CREATE INDEX IF NOT EXISTS idx_liquidity_snapshots_board ON liquidity_snapshots(board_id,as_of_date);
CREATE INDEX IF NOT EXISTS idx_collection_cases_board ON collection_cases(board_id,status,due_date);

-- Procure-to-pay control trail: request, receipt, invoice and approval.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL, supplier_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','ordered','received','closed','cancelled')),
  total_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'NOK', requested_by TEXT, approved_by TEXT, approved_at TEXT,
  external_reference TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(board_id,order_number)
);
CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  received_date TEXT NOT NULL, received_by TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','disputed')), notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL, supplier_name TEXT NOT NULL, amount_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'NOK', due_date TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','matched','exception','approved','booked','paid')), match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK(match_status IN ('unmatched','matched','partial','exception')),
  approved_by TEXT, approved_at TEXT, external_reference TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(board_id,invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_board ON purchase_orders(board_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_board ON goods_receipts(board_id,received_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_board ON supplier_invoices(board_id,status,due_date);
