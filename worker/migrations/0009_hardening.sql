-- Hardening: privacy friendly visitor hash for deduplicating discovery events. Additive.
ALTER TABLE product_events ADD COLUMN visitor_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX product_events_dedupe ON product_events(product_id,event_type,visitor_hash,created_at);
CREATE INDEX products_discovery ON products(listing_status,status,created_at DESC);
