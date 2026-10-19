# Integrations and execution status

Requva currently connects to Cloudflare D1 only. Social publishing, directory submissions, email delivery, audience search, referrals to external networks, and Gemini are not connected to provider APIs.

| Channel | Current workflow | Execution state |
| --- | --- | --- |
| LinkedIn, Facebook, Instagram, X, Reddit, TikTok, Pinterest | Save a campaign plan and use the channel yourself | Manual; no authorized API |
| Email | Plan an opt-in tester invitation | Manual; no email service |
| Directories, search discovery, forums, communities | Save a research/distribution plan | Manual |
| Partnerships, referrals, affiliates | Manual planning only | Manual; no partner tracking network |
| Product testing | Testers explicitly opt into active products and can submit feedback with consent | Supported inside Requva |
| Visits, signups, activation, retention | Display only from recorded events | Unavailable until a real, authenticated server-side measurement integration is added |
| Gemini | No feature exposed | Disabled and not implemented |

Every stored campaign uses `execution_mode=manual`. Saving or changing campaign status never publishes content, messages an audience, or marks a user acquired. Audience suggestions are simple keyword prompts derived from the submitted product text; they are not web research and include no fabricated evidence.

## Analytics events

Campaign activity and tester feedback are counted from Requva database actions. Visit, signup, activation, and retention counts stay at zero without a true product integration. The current Worker intentionally does not provide a public event-ingest endpoint. Add one only with a server-side per-product credential, idempotency key, abuse controls, and documented verification semantics; never trust a browser-submitted `verified` flag.

## Third-party terms

Before adding a provider integration, review its current API access rules, user authorization requirements, quotas, costs, content policies, and rate limits. Requva must keep human approval where required, record actual provider responses, and report an action as complete only after the provider confirms it.

