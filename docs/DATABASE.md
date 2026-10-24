# D1 setup and schema

The Worker has one D1 binding named `DB`. Migrations `0001_initial.sql` through `0004_operational_reporting.sql` create users, sessions, products, campaigns, testers, feedback, referrals, analytics events, settings, audit records, SQL-backed rate-limit state, AI usage records, saved AI campaign plans, and hashed per-product tracking credentials, curated opportunities, distribution activities, testing requests, and product listing reports. Migration 0003 only adds columns and tables; it does not delete or reset existing data. No KV namespace or binding is used.

## Create and bind the production database

From the repository root, authenticate Wrangler with your Cloudflare account, then:

```powershell
cd worker
npx wrangler login
npx wrangler d1 create requva-production
```

Copy the returned `database_id` into `worker/wrangler.jsonc` under `d1_databases[0].database_id`. Commit that ID (it is an identifier, not a secret). Deploy the Worker once or use the dashboard binding editor and set the binding name to exactly `DB` and the database to `requva-production`.

Apply the schema to the local development database and then production:

```powershell
npx wrangler d1 migrations apply requva-production --local
npx wrangler d1 migrations apply requva-production --remote
```

Verify the migration state:

```powershell
npx wrangler d1 migrations list requva-production --remote
npx wrangler d1 execute requva-production --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

The expected tables include `users`, `sessions`, `products`, `campaigns`, `testers`, `feedback`, `referrals`, `analytics_events`, `settings`, `audit_log`, `rate_limits`, `ai_usage`, and `product_integrations`, plus `distribution_opportunities`, `distribution_activities`, `testing_requests`, and `product_reports`. Migration 0002 adds `campaigns.plan_json`; migration 0003 adds product audience fields, listing moderation, request-scoped tester consent and participation milestones, and the distribution workflow tables. Migration 0004 adds campaign completion evidence and removes campaign-activity events that were incorrectly recorded when plans were created. Campaign plans and other records are preserved. Apply new migrations with Wrangler; do not edit migrations already applied.

## Accounts and administrator access

Public account registration is enabled in the Cloudflare Worker. The browser sends the form to the Worker; password hashing, account/session creation, and D1 writes happen server-side. User, session, recovery record, and audit row are saved as one D1 batch so a failed write does not leave a half-created account. New accounts receive the ordinary `user` role. Admin-only routes remain restricted to accounts explicitly assigned the `admin` role; no bootstrap token or setup endpoint is used. Recovery-question hashes are stored in reserved `settings` keys and hidden from the admin settings API. Existing accounts can set a recovery answer while signed in under Account settings. Security-question recovery is weaker than an emailed reset flow and depends on a hard-to-guess secret answer. Promote the owner account to `admin` only by a deliberate D1 Console update after normal signup (see [SECURITY.md](SECURITY.md)).

## Local development

`worker/.dev.vars.example` is a safe placeholder only. Copy it to `worker/.dev.vars` for local secrets if needed; that real file is ignored and must never be committed. Use local D1 migrations before `npm run dev`. Keep local and production databases distinct.

D1 references: [Get started with D1](https://developers.cloudflare.com/d1/get-started/) and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).


## Migration 0005: self service publishing

Adds `products.hold_reason` and `products.hold_source` (screening, reports, moderator). `listing_status` keeps its existing values: `approved` is published, `pending` is held for exceptional review, `rejected` is restricted. The migration publishes legacy pending listings that pass basic screening, marks the rest as screening holds, and writes audit rows. No rows are deleted. Apply with `npm run db:remote` in `worker/`.

## Migration 0006: user capabilities

Adds `user_capabilities` (founder, product_user, tester) so one account can hold several capabilities. Existing users get `product_user`; users with products get `founder`; users who opted in as testers get `tester`. The Worker enforces capabilities on product creation, testing request creation and tester opt in, and `POST /api/v1/auth/capabilities` activates more later.

## Migration 0007: directory

Adds `categories` (seeded with nine categories, editable data), listing fields on `products` (`tagline`, `category_slug`, `subcategory`, `pricing_model`, `supported_region`, `seeking`) and `product_events` (`listing_view`, `outbound_click`). Legacy free text categories are mapped to slugs only when they match exactly.

## Discovery API and ranking

Public routes: `GET /api/v1/discover/categories`, `GET /api/v1/discover/products` (q, category, pricing, stage, testing, sort, page), `GET /api/v1/discover/products/:id`, `POST /api/v1/discover/view/:id`, `GET /api/v1/go/:id` (records an outbound click, then redirects). Owner route: `GET /api/v1/products/:id/discovery-stats?days=7|30|90`.

Default ranking inputs: text match weighted by field (name, tagline and problem, then other fields), listing completeness, open testing request, a boost for listings under 14 days old that decays to zero, and a small daily rotation seeded by product id and date. Click and view counts are deliberately not ranking inputs, so large audiences cannot lock in position. Events are rate limited per visitor and product (30 per hour). Only active, approved listings appear. The raw website address is exposed only through the tracked redirect.

## Tables kept but no longer used

`campaigns`, `distribution_opportunities`, `distribution_activities`, `referrals` and `ai_usage` remain with their data but are no longer read or written. See [RETIRED-FEATURES.md](RETIRED-FEATURES.md) for the optional, backed up way to drop them.
