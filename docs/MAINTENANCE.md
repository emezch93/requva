# Maintenance

## Routine code changes

1. Work on a feature branch and open a pull request to `main`.
2. Review the diff and run the checks in [TESTING.md](TESTING.md).
3. Merge after review. Pages watches `frontend/**`; Workers Builds watches `worker/**` including migrations. Confirm the expected service starts a build and the other does not.
4. Check each build log and deployment status in its own Cloudflare project. A Pages success says nothing about the Worker deployment.

## Database changes

- Add a new numbered SQL file under `worker/migrations/`; do not edit a migration already applied remotely.
- Apply locally, inspect the resulting schema, then apply remotely during a planned maintenance window.
- Back up production data using the account's chosen D1 export/backup process before destructive schema changes. Record migration status in the release notes.

## Secrets and configuration

Use Cloudflare Worker secrets for private values. Rotate any exposed credential immediately. Keep `frontend/config.js` and the Worker `FRONTEND_ORIGIN` aligned when changing domains. Preview origins require a deliberate preview environment rather than widening production CORS.

## Rollback and incident response

Use the Cloudflare deployment history to roll back a Worker or Pages version independently. If auth appears compromised, remove active sessions from D1, rotate affected user passwords, revoke bootstrap secrets, and inspect `audit_log` and Worker logs. Document the incident and any data restoration actions.

## Periodic review

Review provider terms before integrations, D1 rate limits and quotas as traffic grows, account recovery and deletion procedures, the current dependency versions, compatibility date, and Cloudflare Git build settings. Update this document when production resources or runbooks change.

