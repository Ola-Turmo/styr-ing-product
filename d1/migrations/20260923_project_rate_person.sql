ALTER TABLE project_rates ADD COLUMN person_id TEXT REFERENCES people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_rates_person ON project_rates(board_id,project_id,person_id,valid_from);
