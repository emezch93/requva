-- Self-service publishing. Eligible listings publish automatically; 'pending' now means
-- "held for exceptional review" and 'rejected' means "restricted". No data is deleted.
ALTER TABLE products ADD COLUMN hold_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN hold_source TEXT NOT NULL DEFAULT '';

-- Release legacy listings that were only waiting for routine approval and pass basic screening.
INSERT INTO audit_log(id,actor_id,action,target_type,target_id,metadata_json)
SELECT lower(hex(randomblob(16))),NULL,'product.auto_published_migration','product',id,'{"from":"pending","to":"approved"}'
FROM products
WHERE listing_status='pending' AND status!='archived' AND length(trim(name))>=2 AND length(trim(description))>=10
  AND (url LIKE 'https://%' OR url LIKE 'http://%')
  AND url NOT LIKE '%://bit.ly/%' AND url NOT LIKE '%://tinyurl.com/%' AND url NOT LIKE '%://t.co/%' AND url NOT LIKE '%://goo.gl/%' AND url NOT LIKE '%://is.gd/%' AND url NOT LIKE '%://cutt.ly/%';

UPDATE products SET listing_status='approved',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE listing_status='pending' AND status!='archived' AND length(trim(name))>=2 AND length(trim(description))>=10
  AND (url LIKE 'https://%' OR url LIKE 'http://%')
  AND url NOT LIKE '%://bit.ly/%' AND url NOT LIKE '%://tinyurl.com/%' AND url NOT LIKE '%://t.co/%' AND url NOT LIKE '%://goo.gl/%' AND url NOT LIKE '%://is.gd/%' AND url NOT LIKE '%://cutt.ly/%';

-- Anything still pending was held by screening rules; an owner edit that passes screening releases it.
UPDATE products SET hold_source='screening',hold_reason='Held by automatic screening before this release.' WHERE listing_status='pending';
UPDATE products SET hold_source='moderator' WHERE listing_status='rejected';
