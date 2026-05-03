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
