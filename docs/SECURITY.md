# Security

## Current controls

- Passwords are salted PBKDF2-HMAC-SHA-256 hashes with 100,000 iterations. Cloudflare Workers Web Crypto supports up to 100,000 PBKDF2 iterations. Session tokens are random, only their SHA-256 hashes are stored, and sessions expire after seven days.
- Session cookies are `Secure`, `HttpOnly`, and `SameSite=None` for the current separate Pages and Workers hosts. State-changing browser requests require the configured exact origin and `X-Requested-With: Requva`; credentialed CORS is allowlisted.
- SQL is parameterized. Product/campaign writes use ownership checks. Admin APIs require an explicit `admin` role. Product creation, campaign creation, tester joins, and consent feedback combine primary writes and audit entries in D1 batches.
- Signup, login, password reset, and product changes have D1 rate limits. Password reset uses a salted, hashed security answer and revokes every session on success.
- Gemini is called only by the Worker using `env.GEMINI_API_KEY` in the `x-goog-api-key` header. The key is not returned, logged, or exposed to frontend code. Requests use output schemas, a timeout, bounded inputs, user quotas, and safe error messages. AI feature inputs are user-supplied and treated as untrusted.
- Product tracking tokens are random per-product credentials stored as hashes. Event ingestion accepts only supported event names and idempotency keys; the token binds events to an existing product.
- Submitted product URLs are validated and stored, never fetched, preventing URL-fetch SSRF. Campaign plans are marked manual and never reported as externally published.
- Responses use no-store caching and security headers; logs avoid passwords, tokens, and the Gemini secret.

## Admin setup

There is no public bootstrap route. First create your own account, then use Cloudflare D1 Console to promote that exact trusted account:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Check the affected row and sign out/in to refresh the role in the session response. Never use a public signup token or grant admin based on an email domain.

## Account recovery and deployment boundaries

Security-question recovery is weaker than email-based one-time links because answers can be guessed or learned. Choose an answer that is private and not searchable. Requva does not verify email ownership, send reset emails, or provide MFA. The Pages `pages.dev` and Worker `workers.dev` domains are cross-site; some browsers restrict third-party cookies. A custom Pages and Worker domain under the same registrable domain is recommended for production login stability.

## Operational limits

These controls are not a security certification. Configure Cloudflare bot/WAF controls, backups, retention/deletion procedures, and alerts before broad public use. D1 rate limits write to the database and may need tuning as traffic grows. Monitor Worker logs for errors; never paste secrets into tickets or screenshots.


## Directory, tester, and distribution controls

Valid product listings publish automatically. Backend screening (required fields, URL validation, link shorteners, IP or local hosts, spam terms, duplicate addresses, daily limit and rate limits) holds suspicious submissions as pending. Three distinct open reports also hold a listing. Owners can release only screening holds by fixing the listing; report holds and restrictions need an administrator. Listing reports are stored for review. Testers must opt in to an open request and confirm its consent terms; the terms they accepted are stored with their tester record. Product owners see aggregate opt-in, started, and feedback-submitted counts, not tester contact details. Testers may withdraw their opt-in.

Owners may report activity status and evidence but cannot set `verified_completed`. Only an administrator can verify owner-reported evidence, and an administrator cannot verify their own activity. Analytics events authenticated with a product tracking token are owner-reported measurements. They are deduplicated but not independently audited by Requva.

The opportunity catalog is manually maintained. A verification date records when an administrator checked the supplied destination and source links; the app does not crawl or continuously recheck those links.

## Sessions without a custom domain

The site (`requva.pages.dev`) and API (`workers.dev`) are different sites, so browsers may block the session cookie as third party. Login and registration also return `session_token`; the frontend stores it in `localStorage` and sends `Authorization: Bearer`. The Worker accepts the bearer token or the cookie, hashes tokens at rest, expires sessions server side, and logout revokes them. State changing requests still require the verified Origin and `X-Requested-With`. XSS is the main risk of this approach, so the CSP forbids inline scripts and styles and all page text is inserted with `textContent`. Keep it that way: never add inline scripts or `innerHTML` with API data.

## Abuse controls added in migration 0009 and the hardening release

- Listing screening also holds non https addresses, look alike (xn--) domains and sensitive brand words in the domain that do not match the product name.
- New accounts can list 2 products in their first 24 hours.
- Only reports from accounts older than 24 hours count toward the automatic report hold.
- Listings younger than 14 days open a "You are leaving Requva" page before the outbound click is counted or followed.
- Views and clicks ignore bots and empty user agents and count once per visitor per product per hour (a daily rotating hash, no raw IP stored).
- Optional `ALERT_WEBHOOK_URL` (Worker secret, for example a Discord or Slack webhook) is called when a listing is held or auto held. Alerts never include emails.
