# Testing and verification

Run tests from `worker/`. The test suite uses Node's built-in test runner and SQLite to execute the production migration and exercise the Worker router without Cloudflare credentials.

```powershell
cd worker
node --test
node --check src/index.js
cd ..
node --check frontend/app.js
```

The tests cover API health, strict origin/custom-header checks, first-admin setup, password-based registration, session cookies, product creation, campaign planning, tester opt-in, consent-based feedback, analytics summaries, and admin authorization data. SQLite migration execution also checks that the initial schema applies cleanly.

## Manual browser checks before launch

1. Set the real API origin in `frontend/config.js` and the same exact Pages origin in Worker `FRONTEND_ORIGIN`.
2. Create the first admin, remove the bootstrap secret, create a normal account, add and pause/archive a product, then create/update a manual campaign.
3. In a second account, opt in to another active product and submit feedback with explicit consent. Confirm the owner sees only the feedback count and can fetch their product's feedback endpoint.
4. Confirm unauthorized origins, missing CSRF headers, unauthenticated writes, and non-admin admin routes fail.
5. Confirm analytics shows campaign and feedback actions only. Visit/signup/activation/retention counts stay zero until a real integration is implemented.
6. Confirm the Pages site and the Worker each have successful, independent Git-triggered deployment records. Verify `/api/v1/health` on the deployed API.

Never use real user or production data in local tests. Production deployment and third-party integration checks require the account owner's Cloudflare resources and actual provider credentials.

