# D1 setup and schema

The Worker has one D1 binding named `DB`. The first migration is `worker/migrations/0001_initial.sql`; it creates users, sessions, products, campaigns, testers, feedback, referrals, analytics events, settings, audit records, and SQL-backed rate-limit state. No KV namespace or binding is used.

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

The expected tables include `users`, `sessions`, `products`, `campaigns`, `testers`, `feedback`, `referrals`, `analytics_events`, `settings`, `audit_log`, and `rate_limits`.

## Accounts and administrator access

Public account registration is enabled in the Cloudflare Worker. The browser sends the form to the Worker; password hashing, account/session creation, and D1 writes happen server-side. User, session, recovery record, and audit row are saved as one D1 batch so a failed write does not leave a half-created account. New accounts receive the ordinary `user` role. Admin-only routes remain restricted to accounts explicitly assigned the `admin` role; no bootstrap token or setup endpoint is used. Recovery-question hashes are stored in reserved `settings` keys and hidden from the admin settings API. Existing accounts can set a recovery answer while signed in under Account settings.

## Local development

`worker/.dev.vars.example` is a safe placeholder only. Copy it to `worker/.dev.vars` for local secrets if needed; that real file is ignored and must never be committed. Use local D1 migrations before `npm run dev`. Keep local and production databases distinct.

D1 references: [Get started with D1](https://developers.cloudflare.com/d1/get-started/) and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

