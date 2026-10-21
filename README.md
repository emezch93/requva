# Requva

**Reach the right people. Grow with real users.**

Requva is a product discovery and tester feedback workspace. The static frontend lives in `frontend/` as separate home, discovery, founder workspace, tester area, and admin console pages. The API is a Cloudflare Worker in `worker/`, with Cloudflare D1 storage.

## What the app does

- Account signup/login, seven-day secure sessions, password changes, and password reset with a security question.
- Product profiles with problem, audience, category, launch objective, and feedback focus; valid listings publish automatically after backend screening; suspicious or heavily reported listings are held for exceptional review.
- A moderated public product directory with text/category search, shareable listing URLs, and user-submitted listing reports.
- Opt-in testing requests with stated requirements, effort, feedback questions, consent terms, tester start/feedback milestones, owner-visible aggregate counts, and owner controls to pause, reopen, or close recruitment. Owners do not receive tester contact details.
- A curated opportunity catalog that administrators must populate with real destination and source links, then verify manually. No sample communities or fabricated partners are preloaded.
- A distribution work queue that ties owner activities to verified catalog entries. Owners can report completion with evidence; only a different administrator can mark it verified.
- Manual campaign planning and an evidence-required completion report. A saved plan is not counted as distribution; reported completion is owner-reported and not independently verified. Requva does not post, email, or contact audiences; social and email adapters are unavailable.
- Product activity counts from Requva records. Visits, signups, activation, and retention events come from a product owner's server token and are owner reported; Requva does not independently verify them.
- Optional Gemini assistance for product audience analysis, saved campaign drafts, feedback summaries, growth suggestions, and matching against the administrator-verified opportunity catalog. Match results cite only catalog entries; fit statements remain AI hypotheses. The API key stays in a Cloudflare Worker secret. AI output is a draft based on submitted information; it is not live research or a verified result.

Public signups receive the ordinary `user` role. To enable admin-only settings, an owner manually promotes a trusted account in D1; there is no public administrator bootstrap endpoint.

## Deploy and configure

1. Follow [deployment](docs/DEPLOYMENT.md) and confirm the deployed Worker source commit.
2. Follow [database setup](docs/DATABASE.md) and apply all migrations.
3. In Cloudflare, add the Worker secret `GEMINI_API_KEY` if you want AI features. The secret is never stored in this repository or sent to the browser.
4. Run the checks in [testing](docs/TESTING.md), then follow [integration instructions](docs/INTEGRATIONS.md).

## Limits to understand

Requva currently has no social network publishing, mailing, paid acquisition, automatic website crawling, email verification, or email-based account recovery. Security-question recovery is weaker than an emailed one-time reset link. Requva cannot promise reach, user acquisition, conversion, or retention from a saved plan.

## Repository map

- `frontend/index.html` — public home.
- `frontend/discover.html` — searchable public product directory.
- `frontend/dashboard.html` — signed-in founder workspace.
- `frontend/testers.html` — public tester discovery and signed-in tester activity.
- `frontend/admin.html` — administrator-only operations console.
- `frontend/` — responsive shared styles and scripts for these pages.
- `worker/src/index.js` — Worker API and server-side Gemini requests.
- `worker/migrations/` — additive D1 schema migrations.
- `docs/` — deployment, database, integration, security, and testing notes.
