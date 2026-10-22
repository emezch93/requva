-- In app notification centre for founders and users. Additive. emailed_at is reserved for an optional future email provider.
CREATE TABLE notifications (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 type TEXT NOT NULL,
 product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 link TEXT NOT NULL DEFAULT '',
 dedupe_key TEXT NOT NULL,
 read_at TEXT,
 emailed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id,dedupe_key);
CREATE INDEX notifications_user ON notifications(user_id,read_at,created_at DESC);
