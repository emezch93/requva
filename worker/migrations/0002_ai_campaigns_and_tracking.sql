ALTER TABLE campaigns ADD COLUMN plan_json TEXT;

CREATE TABLE ai_usage (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 feature TEXT NOT NULL,
 model TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('success','provider_error','invalid_output','timeout')),
 input_chars INTEGER NOT NULL DEFAULT 0,
 output_chars INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ai_usage_user_date ON ai_usage(user_id,created_at DESC);
CREATE INDEX ai_usage_created ON ai_usage(created_at DESC);

CREATE TABLE product_integrations (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
