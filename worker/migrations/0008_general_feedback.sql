-- Voluntary product feedback, separate from structured testing feedback. Additive.
CREATE TABLE product_feedback (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL DEFAULT 'general' CHECK(kind IN ('general','bug','idea','praise')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 5 AND 2000),
 status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','withdrawn','hidden')),
 owner_response TEXT NOT NULL DEFAULT '',
 owner_responded_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX product_feedback_product ON product_feedback(product_id,status,created_at DESC);
CREATE INDEX product_feedback_author ON product_feedback(author_id,created_at DESC);
CREATE TABLE product_feedback_reports (
 feedback_id TEXT NOT NULL REFERENCES product_feedback(id) ON DELETE CASCADE,
 reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(feedback_id,reporter_id)
);
