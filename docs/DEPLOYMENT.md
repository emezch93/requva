# Deployment: Requva on Cloudflare

The repository is connected to two separate Cloudflare Git deployments: Pages for the static frontend and Workers Builds for the API. They are independent; one can deploy while the other is stale. The account owner must authorize the GitHub integration in Cloudflare.

## Current project settings

- GitHub repository: `emezch93/requva`, production branch `main`.
- Pages project: `requva`, static files from `frontend/`. Use repository root `/`, no build command, and output directory `frontend`. The site should serve `frontend/index.html` at `https://requva.pages.dev/`.
- Worker: `requva`, root directory `worker`, D1 binding `DB → requva-production`. The current Worker dashboard command is `npm run db:remote && npm run deploy`; the database migration runs before the Worker deploy.
- Worker API origin: `https://requva.emezch93.workers.dev`.
- Frontend `FRONTEND_ORIGIN`: `https://requva.pages.dev`.

Check these settings in the Cloudflare dashboard if a build deploys the wrong files. The Pages project serves static assets only; the Worker handles all `/api/v1` endpoints.

## Deploying code changes

1. Commit to GitHub `main`. A frontend commit should trigger Pages. A Worker or migration commit should trigger Workers Builds.
2. In **Workers & Pages → requva → Deployments**, open the newest production deployment. Confirm its commit SHA is the new `main` SHA and status is **Success**.
3. Confirm the version settings include `FRONTEND_ORIGIN=https://requva.pages.dev`, `AI_ENABLED=true`, D1 `DB` binding to `requva-production`, and the `GEMINI_API_KEY` secret if AI will be used.
4. Visit `https://requva.emezch93.workers.dev/api/v1/health` and confirm it returns JSON with `ok: true`.
5. Pages deploys independently. Confirm its latest successful deployment is also from the current commit. If `requva.pages.dev` shows 404, check **Workers & Pages → requva (Pages) → Deployments** and verify output contains `index.html`; then check **Custom domains** to ensure `requva.pages.dev` is attached to that Pages project.

Do not troubleshoot signup against an old Worker version. The repository source fixes PBKDF2 at `100000`. If a Worker log still says “requested 120000”, Cloudflare is running an older version or a different Worker. Confirm the deployment's Git commit and Worker name, then retry signup only after the new version succeeds.

## Add the Gemini key without exposing it

In the Worker dashboard, open **Settings → Variables and Secrets → Production → Add → Secret**. Set the name to `GEMINI_API_KEY`, paste the key value from Google AI Studio, and save/deploy. Do not add it to Pages, `frontend/config.js`, `wrangler.jsonc`, GitHub, or browser developer tools. The Worker reads it through `env.GEMINI_API_KEY`.

## Admin access

Create an account normally, then promote your account using a D1 Console query. See [SECURITY.md](SECURITY.md). Never enable a public admin bootstrap endpoint.

## Database

Migration 0002 adds AI usage, saved campaign plan, and hashed product-tracking-token tables. The Worker build command applies pending migrations before deploy. See [DATABASE.md](DATABASE.md) to inspect migration state. Never edit a migration that already ran remotely; add a new numbered migration.

For local code checks, see [TESTING.md](TESTING.md). Cloudflare dashboard credentials and the live deployment are outside this repository; only a successful production deployment and smoke check confirm the service is live.


## Independent deployments

Pages publishes the static files from `frontend/`; it does not deploy the API. Workers Builds uses the `worker/` root and runs the configured remote migration command before deploying the Worker. After a code change, check each deployment independently. A Pages success message does not prove the Worker version changed, and a Worker deployment does not prove Pages published the latest frontend.

## Release: self service network (migrations 0005 to 0008)

Before deploying, back up D1: `cd worker && npx wrangler d1 export requva-production --remote --output backup-before-0005.sql`.

1. Merge `feature/self-service-publishing` into `main` (or push the files from the deployment zip). Both Pages and Workers Builds redeploy.
2. The Worker build runs `npm run db:remote`, applying 0005 (self service publishing), 0006 (capabilities), 0007 (directory) and 0008 (general feedback). All are additive. 0005 publishes legacy pending listings that pass screening and holds the rest.
3. Check `https://requva.emezch93.workers.dev/api/v1/health` returns `schemaVersion: 8`.
4. Smoke test: register with the founder capability, submit a product, open `/discover.html`, search for it, click Visit, open `/product.html?id=...`, leave feedback from a second account, then check the Growth workspace on `/dashboard.html`.
5. No new secrets, bindings or KV are needed. `GEMINI_API_KEY` stays a Worker secret.
