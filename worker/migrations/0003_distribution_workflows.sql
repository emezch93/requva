ALTER TABLE products ADD COLUMN problem TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN audience TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN objective TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN feedback_target TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN listing_status TEXT NOT NULL DEFAULT 'approved' CHECK(listing_status IN ('pending','approved','rejected'));

CREATE TABLE distribution_opportunities (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 destination_url TEXT NOT NULL CHECK(length(destination_url) BETWEEN 8 AND 2048),
 channel TEXT NOT NULL CHECK(length(channel) BETWEEN 1 AND 60),
 audience TEXT NOT NULL CHECK(length(audience) BETWEEN 1 AND 500),
 rationale TEXT NOT NULL CHECK(length(rationale) BETWEEN 1 AND 1000),
 source_url TEXT NOT NULL CHECK(length(source_url) BETWEEN 8 AND 2048),
 last_verified_at TEXT,
 requirements TEXT NOT NULL DEFAULT '',
 eligibility TEXT NOT NULL DEFAULT '',
 next_action TEXT NOT NULL CHECK(length(next_action) BETWEEN 1 AND 500),
 execution_mode TEXT NOT NULL DEFAULT 'manual' CHECK(execution_mode IN ('manual','unavailable')),
 status TEXT NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','verified','archived')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(status!='verified' OR last_verified_at IS NOT NULL)
);
CREATE INDEX distribution_opportunities_status ON distribution_opportunities(status,channel,updated_at DESC);

CREATE TABLE distribution_activities (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 opportunity_id TEXT REFERENCES distribution_opportunities(id) ON DELETE SET NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 planned_action TEXT NOT NULL CHECK(length(planned_action) BETWEEN 1 AND 2000),
 draft TEXT NOT NULL DEFAULT '',
 responsible_user_id TEXT NOT NULL REFERENCES users(id),
 execution_mode TEXT NOT NULL DEFAULT 'manual' CHECK(execution_mode IN ('manual','unavailable')),
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','in_progress','awaiting_verification','reported_completed','verified_completed','unsuccessful','blocked','cancelled')),
 next_action TEXT NOT NULL CHECK(length(next_action) BETWEEN 1 AND 500),
 notes TEXT NOT NULL DEFAULT '',
 external_url TEXT,
 evidence_notes TEXT,
 verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 verification_notes TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX distribution_activities_owner ON distribution_activities(owner_id,status,updated_at DESC);
CREATE INDEX distribution_activities_opportunity ON distribution_activities(opportunity_id,status);

CREATE TABLE testing_requests (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tester_type TEXT NOT NULL DEFAULT '',
 instructions TEXT NOT NULL CHECK(length(instructions) BETWEEN 1 AND 2000),
 feedback_questions TEXT NOT NULL CHECK(length(feedback_questions) BETWEEN 1 AND 1500),
 eligibility TEXT NOT NULL DEFAULT '',
 effort_minutes INTEGER CHECK(effort_minutes IS NULL OR effort_minutes BETWEEN 1 AND 600),
 closes_at TEXT,
 consent_terms TEXT NOT NULL CHECK(length(consent_terms) BETWEEN 1 AND 1000),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused','closed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX testing_requests_product ON testing_requests(product_id,status,closes_at);
ALTER TABLE testers ADD COLUMN testing_request_id TEXT REFERENCES testing_requests(id) ON DELETE SET NULL;
ALTER TABLE testers ADD COLUMN testing_consent_terms TEXT NOT NULL DEFAULT '';
ALTER TABLE testers ADD COLUMN participation_status TEXT NOT NULL DEFAULT 'opted_in' CHECK(participation_status IN ('opted_in','started','feedback_submitted','withdrawn'));
ALTER TABLE testers ADD COLUMN started_at TEXT;
ALTER TABLE testers ADD COLUMN feedback_submitted_at TEXT;

CREATE TABLE product_reports (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK(category IN ('misleading','spam','unsafe','other')),
 details TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','resolved','dismissed')),
 reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(product_id,reporter_id,status)
);
CREATE INDEX product_reports_status ON product_reports(status,created_at DESC);
