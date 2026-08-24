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
