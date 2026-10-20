-- One account, several capabilities. Additive; existing users keep working.
CREATE TABLE user_capabilities (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 capability TEXT NOT NULL CHECK(capability IN ('founder','product_user','tester')),
 activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(user_id,capability)
);
INSERT INTO user_capabilities(user_id,capability) SELECT id,'product_user' FROM users;
INSERT OR IGNORE INTO user_capabilities(user_id,capability) SELECT DISTINCT owner_id,'founder' FROM products;
INSERT OR IGNORE INTO user_capabilities(user_id,capability) SELECT DISTINCT user_id,'tester' FROM testers;
