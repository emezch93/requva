# Integrations and execution status

Requva connects a static frontend to a Cloudflare Worker, Cloudflare D1, and optionally Google Gemini. Social publishing and outreach are not connected.

| Feature | Current behavior |
| --- | --- |
| Tester feedback | Users opt into an active product; feedback is shared with the owner only when the tester consents. |
| Campaign channels | LinkedIn, Facebook, Instagram, X, Reddit, TikTok, Pinterest, email, directories, search discovery, forums, communities, partnerships, referrals, and affiliates are planning targets. The user executes each plan manually. |
| Gemini | Server-side structured generation for product analysis, campaign drafts, tester feedback summaries, and next-step suggestions. Requires the `GEMINI_API_KEY` Worker secret and enabled AI settings. Limited to at most 50 requests per user per UTC day; default is 10. |
| Visits, signups, activation, retention | Counted only from events sent by a product owner's server using its per-product tracking token. Browser-submitted events are rejected. Duplicate event keys are ignored. |
| Audience and distribution notes | Generated from founder-submitted product text and stored tester feedback. Requva does not fetch the submitted URL or claim live research. |

## Set up Gemini in Cloudflare

1. Open **Workers & Pages → requva → Settings → Variables and Secrets**.
2. Under **Production**, add a **Secret** named exactly `GEMINI_API_KEY`.
3. Paste the API key created in Google AI Studio and save/deploy the Worker.
4. Sign into Requva as an admin, open the admin panel, and use **Test Gemini connection**. The status should say the key is configured. The UI never displays the value.
5. In the same admin panel, choose the enabled state, daily limit, and supported models. The defaults come from `worker/wrangler.jsonc`.

Never put the key in `frontend/config.js`, page HTML, a GitHub commit, a client-side environment variable, or a support screenshot. If it was exposed, revoke it at Google and create a replacement.

## Send verified product events

In **My products**, create a tracking token and copy it immediately. Requva stores only a hash, so the token is shown once. Keep it on your server (for example, as a deployment secret), never in browser JavaScript. Rotate or revoke it in the same product card.

Send a POST request from your server to `https://requva.emezch93.workers.dev/api/v1/analytics/events`:

```http
Authorization: Bearer rq_live_YOUR_TOKEN
Content-Type: application/json

{"event_type":"visit","event_key":"a-unique-event-id"}
```

Supported event types are `visit`, `signup`, `activation`, and `retention`. Each event needs a unique `event_key`; retries with the same key do not increase the count. Do not send personal information in event keys or payloads. The token authorizes events for one product, and events are attributed to that product's owner. Only send events that your own application has actually observed.

## What is not integrated

Campaign plans are drafts for a person to review and publish themselves. Requva does not contact customers, publish messages, sign into social sites, or scrape web communities. Gemini suggestions are unverified hypotheses and may be wrong; verify claims before using them. Feedback analysis redacts common email addresses and phone numbers, but do not submit sensitive personal or health information.

Review each provider's current terms, consent rules, quotas, and costs before adding more integrations.
