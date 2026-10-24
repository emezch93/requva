# Integrations and execution status

Requva connects a static frontend to a Cloudflare Worker and Cloudflare D1. There are no third party integrations to configure.

| Feature | Current behavior |
| --- | --- |
| Tester feedback | Users opt into an active product; feedback is shared with the owner only when the tester consents. |
| Visits, signups, activation, retention | Counted only from events sent by a product owner's server using its per-product tracking token. Browser-submitted events are rejected. Duplicate event keys are ignored. |
| Listing views, outbound clicks, shares | Recorded by Requva itself. Bots and repeats are ignored. These are not visits to the founder's site or signups. |
| Notifications | In-app only. There is no email delivery. |

## Send tracking events from your own server

Create a tracking token for a product in the founder workspace. Send events from your server with `Authorization: Bearer <token>` to `POST /api/v1/analytics/events` with a JSON body such as `{"event_type":"signup","event_key":"user-123-signup"}`. Supported event types are `visit`, `signup`, `activation` and `retention`. Each event needs a unique `event_key`; retries with the same key do not increase the count. Revoking the token turns tracking back to "not configured".

## What is not integrated

Requva does not publish to social networks, send outreach, send email, or call an AI service. Share buttons only open each service's own share screen.

Review each provider's current terms, consent rules, quotas and costs before adding integrations.
