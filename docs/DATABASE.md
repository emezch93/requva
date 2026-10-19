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

## Bootstrap the first administrator

1. Generate a long one-time setup token locally. Do not commit it.
2. In the Worker dashboard, open **Settings → Variables and Secrets → Add secret**. Name it `ADMIN_SETUP_TOKEN` and store the token.
3. After the Worker is deployed, send a single `POST` to `https://<worker-origin>/api/v1/admin/setup` from the configured Pages origin. Supply JSON `{ "setup_token": "<token>", "email": "admin@example.com", "password": "<12+ character password>" }`, plus `Origin: <exact frontend origin>` and `X-Requested-With: Requva` headers. A `201` response sets the admin session cookie.
4. Confirm the admin account can load `/api/v1/admin/summary`, then remove `ADMIN_SETUP_TOKEN` from Worker secrets and redeploy.
5. Normal `/auth/register` stays closed until an admin exists. Further attempts to use bootstrap return `409`.

Prefer a secure HTTP client that does not save request bodies or headers to shell history. Never paste the setup token into source control.

## Local development

`worker/.dev.vars.example` is a safe placeholder only. Copy it to `worker/.dev.vars` for local secrets if needed; that real file is ignored and must never be committed. Use local D1 migrations before `npm run dev`. Keep local and production databases distinct.

D1 references: [Get started with D1](https://developers.cloudflare.com/d1/get-started/) and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

