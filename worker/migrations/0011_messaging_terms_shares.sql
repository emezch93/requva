-- Messaging threads, public profile fields, recorded terms acceptance and share tracking. Additive: nothing is dropped or rewritten.
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
CREATE TABLE terms_acceptances (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 version TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('registration','prompt')),
 accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX terms_acceptances_user ON terms_acceptances(user_id,accepted_at DESC);

ALTER TABLE product_feedback ADD COLUMN edited_at TEXT;
ALTER TABLE feedback ADD COLUMN edited_at TEXT;
CREATE TABLE feedback_messages (
 id TEXT PRIMARY KEY,
 thread_type TEXT NOT NULL CHECK(thread_type IN ('voluntary','test')),
 thread_id TEXT NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 edited_at TEXT,
 deleted_at TEXT
);
CREATE INDEX feedback_messages_thread ON feedback_messages(thread_type,thread_id,created_at);
CREATE TABLE thread_reads (
 thread_type TEXT NOT NULL CHECK(thread_type IN ('voluntary','test')),
 thread_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 last_read_at TEXT NOT NULL,
 PRIMARY KEY(thread_type,thread_id,user_id)
);
-- Carry earlier single founder replies into the new conversation model so no reply is lost.
INSERT INTO feedback_messages(id,thread_type,thread_id,product_id,author_id,body,created_at)
SELECT lower(hex(randomblob(16))),'voluntary',f.id,f.product_id,p.owner_id,f.owner_response,COALESCE(f.owner_responded_at,f.created_at)
FROM product_feedback f JOIN products p ON p.id=f.product_id WHERE f.owner_response!='';

CREATE TABLE product_shares (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 method TEXT NOT NULL CHECK(method IN ('copy_link','whatsapp','email','gmail','x','linkedin','facebook','native')),
 source TEXT NOT NULL DEFAULT 'direct',
 visitor_hash TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX product_shares_product ON product_shares(product_id,created_at DESC);
CREATE INDEX product_shares_dedupe ON product_shares(product_id,method,visitor_hash,created_at);
