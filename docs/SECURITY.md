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
