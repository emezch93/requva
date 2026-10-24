# Requva

**Discover digital products. Test them honestly.**

Requva is a product discovery and tester feedback platform. The static frontend lives in `frontend/`. The API is a Cloudflare Worker in `worker/` with Cloudflare D1 storage. Pages Functions in `functions/` add per product link previews and a sitemap.

## What the platform does

Requva keeps to a small set of core building blocks. Anything that was built on top of them and was not essential has been retired (see [retired features](docs/RETIRED-FEATURES.md)).

- **Accounts:** signup and login, one account with founder, product user and tester capabilities, optional display name and location, recorded acceptance of the Terms of use, password changes, and recovery with a security question.
- **Listings:** founders publish products. Valid listings go live automatically after backend screening; suspicious or heavily reported listings are held for review. Founders edit, pause and resume their own listings.
- **Discovery:** a public directory with search, categories, filters, product pages, shareable links and tracked outbound clicks.
- **Testing:** opt-in testing requests with stated requirements and consent terms; testers opt in, start and send feedback; founders see participation counts, never contact details.
- **Feedback and messaging:** every piece of feedback is a conversation with names, roles, optional locations, timestamps, read state, and edit and delete for your own messages.
- **Measurement:** listing views, outbound clicks, share button uses, and visits, signups, activation and retention sent by a founder's own server with a per product tracking token. Unconfigured tracking is shown as not configured, never as zero.
- **Notifications:** an in-app alert centre for activity on your products and messages. Requva sends no email.
- **Moderation:** listing reports, automatic holds, restrictions, an audit log and a small administrator console.

Public signups receive the ordinary `user` role. An owner promotes a trusted account to administrator in D1; there is no public administrator bootstrap endpoint.

## Deploy and configure

1. Follow [deployment](docs/DEPLOYMENT.md) and confirm the deployed Worker source commit.
2. Follow [database setup](docs/DATABASE.md) and apply all migrations.
3. Run the checks in [testing](docs/TESTING.md), then read [integrations](docs/INTEGRATIONS.md) for tracking tokens.

No API keys or secrets are required to run the platform.

## Limits to understand

Requva has no social publishing, mailing, paid acquisition, automatic website crawling, email verification or email based account recovery. Security question recovery is weaker than an emailed reset link. Requva cannot promise reach, traffic or users.

Support: support.requva@gmail.com

## Repository map

- `frontend/` pages, styles and scripts (home, discover, product, dashboard, testers, admin, legal and support pages).
- `functions/` Cloudflare Pages Functions for product link previews and the sitemap.
- `worker/src/index.js` Worker API.
- `worker/migrations/` additive D1 schema migrations.
- `worker/test/` and `tests/` automated tests.
- `docs/` deployment, database, integration, security, testing and retirement notes.
