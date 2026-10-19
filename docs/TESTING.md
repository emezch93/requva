# Testing and verification

Run the full Worker API suite and syntax checks from the repository root:

```powershell
cd worker
node --test
node --check src/index.js
cd ..
node --check frontend/app.js
```

Tests use Node's built-in runner and in-memory SQLite with the actual migrations. They exercise registration at the Cloudflare-supported 100,000 PBKDF2 iteration count, login/session invalidation and security-question reset, product moderation, campaign evidence and accurate activity reporting, verified opportunity catalog rules, owner-reported versus admin-verified distribution activity, testing-request pause/close permissions and consent, tester milestones, feedback, listing reports, analytics idempotency, access/CSRF rules, and Gemini request handling with a fake local provider response. They do not call Google or Cloudflare services and use no production secrets.

## Production smoke checks

1. In Cloudflare Worker deployment history, verify the active version was built from the current `main` commit. A log saying PBKDF2 requested 120,000 means that version is stale; current source must use exactly `ITERATIONS = 100000`.
2. Confirm D1 migrations 0001, 0002, 0003, and 0004 applied to the production database.
3. Check `GET https://requva.emezch93.workers.dev/api/v1/health`; then check signup, login, logout, and session refresh from the Pages site.
4. As a user, add a product, make a manual campaign, confirm it is not counted until you report completed work with evidence, have an admin approve the directory listing, create and pause/reopen/close an open testing request, opt in with its stated consent, mark testing started, and send consent-based feedback. Add actual opportunity entries as admin before trying the distribution planner.
5. As an admin, check Gemini status. Add the Worker secret before testing AI; test connection and make one draft. Confirm the secret is never shown in the page or returned by the API.
6. Create a tracking token and send a visit from a server. Repeat the same event key and confirm the count remains one. The resulting analytics are owner reported, not independently verified.
7. Verify Pages and Worker each have a successful, independent Cloudflare deployment. A successful Pages upload does not deploy the Worker.

Do not use real passwords, users, provider keys, or production data in local tests. A local test cannot verify browser third-party-cookie behavior or live Cloudflare deployment health.


## Page and responsive checks

Check the distinct Pages URLs after deployment: `/`, `/discover.html`, `/dashboard.html`, `/testers.html`, and `/admin.html`. A guest who opens the founder workspace is sent to sign-in; a non-admin who opens the admin console is redirected to sign-in and the API still enforces the admin role. At phone widths, verify the menu button opens the page navigation and the workspace forms and cards stack to one column.
