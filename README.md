# Requva

**Reach the right people. Grow with real users.**

Requva is a product discovery, distribution planning, and opt-in tester workspace. The repository separates a static HTML/CSS/JavaScript frontend (`frontend/`) from a Cloudflare Worker API (`worker/`) backed by Cloudflare D1.

## What works

- Product accounts with password-based registration/login, expiring HTTP-only sessions, ownership checks, and status management.
- Product listings, deterministic audience prompts based only on submitted descriptions, manual campaign plans, status history, opt-in tester records, and consent-based feedback.
- Analytics counters for campaign actions and submitted feedback. Visits, signups, activation, and retention remain zero until a verified server-side measurement integration records them.
- Administrator bootstrap via a one-time Cloudflare Worker secret, role-gated summary/user/campaign/audit/settings endpoints.
- Prepared Git integration paths for Pages and Workers. Source commits trigger independent deploys after you connect both Cloudflare projects.

No social platform APIs are connected. Requva never publishes content, contacts people, fetches submitted URLs, or claims an acquisition result. Keyword audience notes are prompts, not external research. Gemini is not implemented and remains disabled.

## Quick start

1. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md) to connect GitHub to Cloudflare Pages and Workers Builds.
2. Follow [DATABASE.md](docs/DATABASE.md) to create D1, configure `database_id`, and apply migrations.
3. Set the exact frontend origin on the Worker and configure `frontend/config.js` with the deployed Worker origin.
4. Set `ADMIN_SETUP_TOKEN` as a Worker secret, perform the first-admin setup, then remove that bootstrap secret.
5. Use [TESTING.md](docs/TESTING.md) for local checks and the end-to-end smoke test.

## Repository map

- `frontend/` — static responsive website, assets, and browser API client. No installable manifest or service worker.
- `worker/src/index.js` — `/api/v1` API.
- `worker/migrations/` — versioned D1 schema.
- `docs/` — deployment, database, security, integration, testing, and maintenance guides.

See [INTEGRATIONS.md](docs/INTEGRATIONS.md) for exact channel support and [SECURITY.md](docs/SECURITY.md) for the current security model and operational requirements.

