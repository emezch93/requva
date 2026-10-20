-- Directory: maintainable categories, richer listing metadata, and first party discovery events.
CREATE TABLE categories (slug TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
INSERT INTO categories(slug,name,sort_order) VALUES
 ('business-finance','Business and Finance',1),('ai-productivity','AI and Productivity',2),('education-learning','Education and Learning',3),
 ('development-technology','Development and Technology',4),('design-creative','Design and Creative Tools',5),('marketing-sales','Marketing and Sales',6),
 ('ecommerce','E-commerce',7),('health-lifestyle','Health and Lifestyle',8),('other','Other',99);
ALTER TABLE products ADD COLUMN tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN category_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN subcategory TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN pricing_model TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN supported_region TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN seeking TEXT NOT NULL DEFAULT '';
-- Map legacy free text categories onto the new slugs where they match; leave the rest for the owner to choose.
UPDATE products SET category_slug=(SELECT slug FROM categories c WHERE lower(c.name)=lower(products.category) OR c.slug=lower(products.category)) WHERE category!='' AND EXISTS(SELECT 1 FROM categories c WHERE lower(c.name)=lower(products.category) OR c.slug=lower(products.category));
CREATE TABLE product_events (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, event_type TEXT NOT NULL CHECK(event_type IN ('listing_view','outbound_click')), source TEXT NOT NULL DEFAULT 'direct', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX product_events_product ON product_events(product_id,event_type,created_at DESC);
