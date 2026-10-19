-- Preserve campaign plans but remove historical events that were logged at plan creation.
-- These are false execution counts; future counts are written only after an owner reports evidenced work.
DELETE FROM analytics_events WHERE event_type='campaign_activity' AND source='manual';

ALTER TABLE campaigns ADD COLUMN completion_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN external_url TEXT;
ALTER TABLE campaigns ADD COLUMN completion_reported_at TEXT;
