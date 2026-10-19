# Security

## Current controls

- Passwords are salted, PBKDF2-HMAC-SHA-256 derived hashes (120,000 rounds); plaintext passwords are never stored. Sessions use random 256-bit tokens, persist only SHA-256 hashes, expire after seven days, and are sent in `Secure; HttpOnly; SameSite=None` cookies for the separate Pages/Workers origins.
- State-changing browser requests require the exact configured `Origin` and `X-Requested-With: Requva`. Credentialed CORS is allowlisted to one `FRONTEND_ORIGIN`; responses receive security headers and no-store caching.
- SQL uses bound parameters. Products and campaigns require owner checks. Admin endpoints require the `admin` role. Feedback requires an active opt-in and explicit sharing consent.
- Login, registration, and password-recovery attempts are rate-limited in D1. Client IPs are hashed before the rate-limit key is saved. Registration stores the user, session, salted recovery-answer hash, and audit entry in one D1 batch. Submitted product URLs are validated and stored, never fetched; this avoids URL-fetch SSRF.
- Audit entries cover account, product, campaign, feedback, and settings actions. Error bodies do not contain exception details.

## Secrets and configuration

- Never commit `.dev.vars`, Worker secrets, API keys, passwords, session tokens, or bootstrap values.
- Public signups receive only the ordinary `user` role; admin endpoints still require the `admin` role.
- If a future Gemini integration is added, it must remain disabled by default, keep its key in a Worker secret, enforce quotas, and expose errors safely. Gemini is not currently integrated.
- `FRONTEND_ORIGIN` is a non-secret exact origin. Keep it in the Worker configuration and review it on every domain change.

## Operational hardening before public launch

This repository is an initial product implementation, not a security certification. Before broad public use, configure Cloudflare WAF/bot controls and alerting, choose a backup/retention policy, test account recovery and data deletion procedures, review applicable privacy/consumer laws, and add monitoring for rate-limit abuse and D1 errors. Password recovery uses the account email plus a selected security question and answer. The answer is salted and hashed, reset attempts are rate-limited, incorrect answers receive a generic response, and a successful reset revokes every active session. Security questions are weaker than a one-time email link because answers can be guessed or learned; users should choose a private answer that is not publicly discoverable. The app does not send recovery emails, verify email ownership, provide MFA, or include built-in abuse-report moderation. Do not promise those controls to users. Password changes are available from account settings and revoke other active sessions.

The D1 rate limiter is deliberately simple and consumes database writes. Review quotas and replace/tune it if traffic grows; do not add KV. Rotate sessions after credential changes when account settings are implemented.

