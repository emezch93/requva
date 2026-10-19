# Deployment: GitHub → Pages + Workers Builds

This repository is prepared for two independent Cloudflare Git integrations. The Cloudflare account owner must connect each project from the Cloudflare dashboard and authorize GitHub; these account-level connections cannot be created from this repository. Pages Git integration does not deploy the API Worker. For production authentication, use a custom domain for Pages and a Worker custom domain under the same registrable domain (for example `requva.example.com` and `api.requva.example.com`). The separate `pages.dev` and `workers.dev` hosts are cross-site; browser third-party-cookie controls may block session cookies there.

## 1. Push the repository to GitHub

The requested repository is `https://github.com/emezch93/requva`. Push the project to its `main` branch. Keep the repository free of `.dev.vars`, API keys, passwords, and account secrets. For a local checkout:

```powershell
git clone https://github.com/emezch93/requva.git
# Copy the project files into the checkout, then:
git add .
git commit -m "Build Requva application"
git branch -M main
git push -u origin main
```

## 2. Create D1 before the first Worker build

Create `requva-production` using the steps in [DATABASE.md](DATABASE.md), copy the returned database ID into `worker/wrangler.jsonc`, and commit that configuration before creating the Worker Builds project. The placeholder database ID intentionally prevents an accidental unbound production deploy.

## 3. Create the Pages project

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Import an existing Git repository**.
2. Authorize Cloudflare's GitHub app for `emezch93/requva`.
3. Use `main` as the production branch.
4. Set the repository root to `/` (the repo root). Set build command to `exit 0`. Set build output directory to `frontend`.
5. Save and deploy. Confirm that `https://<your-pages-project>.pages.dev/` serves the landing page.
6. Under Pages **Settings → Builds → Build watch paths**, include `frontend/**` and exclude `worker/**` and unrelated docs. If dashboard path filters are unavailable, Pages may build on every repo commit; the frontend is static and the build command is a no-op.

## 4. Create the Worker Builds project separately

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Worker** → **Connect to Git** (Workers Builds).
2. Authorize the same GitHub repository. Select `main` as production branch.
3. Set the Worker root directory to `worker`. Use `npm run deploy` as the build/deploy command (Workers Builds installs the directory's `package.json`; the script runs Wrangler).
4. Confirm `worker/wrangler.jsonc` is detected and the build completes. In Worker Builds settings, set watch paths to `worker/**` (including `worker/migrations/**`). This is a separate project from Pages.
5. Record the deployed API origin, usually `https://requva-api.<account-subdomain>.workers.dev`.

## 5. Configure the frontend API origin

Edit `frontend/config.js` and replace `https://requva-api.example.workers.dev` with the actual Worker origin (origin only, no `/api/v1`). Make the same replacement in the `connect-src` directive in `frontend/_headers`. Commit this frontend change. Pages deploys it automatically after the integration is connected.

In the Worker settings, set `FRONTEND_ORIGIN` to the exact Pages origin, such as `https://requva.pages.dev` (no trailing slash). For a custom domain, use its exact `https://` origin. Commit the matching `vars.FRONTEND_ORIGIN` in `worker/wrangler.jsonc` and redeploy. Preview Pages origins will not pass this production allowlist; configure a separate preview Worker environment before testing preview auth flows.

## 6. Accounts

Public account registration is enabled. New accounts receive the ordinary `user` role. Admin-only routes remain restricted to accounts explicitly assigned the `admin` role; no bootstrap secret is needed.

## 7. Verify independent deployments

- Make a small `frontend/` change and confirm only Pages' watched build runs.
- Make a harmless `worker/` change and confirm Workers Builds runs independently.
- `GET https://<worker-origin>/api/v1/health` should return `ok: true`.
- Open the Pages site, create an account, add a product, create a campaign, opt into another product as a tester, and submit feedback.
- Confirm a Pages-origin request succeeds with cookies and a different origin is rejected.
- Confirm the dashboard build histories show separate Pages and Worker deployments. Do not call the system live until these checks pass.

## Alternative when dashboard Git integration is unavailable

Cloudflare requires dashboard authorization for both Git providers. If your plan/account cannot use Workers Builds, use the CLI for the Worker only:

```powershell
cd worker
npm install
npx wrangler deploy
```

This is a manual fallback; it does not create automatic Worker deployments. Pages still uses its Git integration. Verify `npx wrangler deployments list` and the Worker health route.

Cloudflare setup references: [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [static HTML Pages deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), and [Workers Builds Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/).

