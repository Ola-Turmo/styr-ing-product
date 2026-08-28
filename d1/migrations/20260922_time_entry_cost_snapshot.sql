ALTER TABLE time_entries ADD COLUMN cost_rate_minor INTEGER;
UPDATE time_entries
SET cost_rate_minor = COALESCE((
  SELECT c.cost_hourly_minor
  FROM project_rate_costs c
  JOIN project_rates r ON r.id = c.rate_id
  WHERE r.project_id = time_entries.project_id
    AND r.board_id = time_entries.board_id
    AND (r.valid_from IS NULL OR r.valid_from <= time_entries.work_date)
  ORDER BY r.valid_from DESC, r.created_at DESC
  LIMIT 1
), 0)
WHERE cost_rate_minor IS NULL;
