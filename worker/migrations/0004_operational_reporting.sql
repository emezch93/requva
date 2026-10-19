-- Preserve historical analytics rows that were recorded when plans were created.
-- They are excluded from execution totals; evidenced owner reports use campaign-completed:<id>.
ALTER TABLE campaigns ADD COLUMN completion_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN external_url TEXT;
ALTER TABLE campaigns ADD COLUMN completion_reported_at TEXT;
