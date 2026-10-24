# Retired features

Requva keeps only the building blocks the platform depends on: accounts, listings, discovery, testing, feedback and messaging, measurement, notifications and moderation. Features built on top of those, which no other part needed, were removed to cut surface area, cost and risk.

## What was removed

| Retired | Why | Replaced by |
| --- | --- | --- |
| Distribution opportunities, the administrator verified catalog, the distribution work queue and its verification | A manual workflow that depended on an administrator curating destinations. It was not used by anything else and could not be automated honestly. | Founders share through the share dialog and measure with listing views, clicks, shares and tracking events. |
| Campaigns and AI campaign plans | A generic plan generator. The product direction is real discovery and testing, not plans. | Nothing. |
| Gemini AI features (audience analysis, feedback summaries, growth suggestions, opportunity matching) and AI admin settings | Optional layer on top of other features, with a secret, cost and trust burden. | Founders read the feedback and metrics themselves. |
| Referral codes and referral entry | Growth feature nobody else depended on. | Nothing. The `referral_code` column still exists because it is required by the schema. |
| Owner wide analytics summary cards | Mixed all of an owner's products together and showed zero when tracking was off. | The per product growth workspace. |
| Guessed "possible audience" lines on product cards | Keyword guesses presented as audience insight. | Nothing. |

## What was kept

Testing requests and tester milestones (they lived in the same file as distribution but are core), product reports and the moderation tools, the generic admin settings table (it also stores account recovery data), tracking tokens and event ingestion.

## Data is not deleted

No migration drops anything. The tables `campaigns`, `distribution_opportunities`, `distribution_activities`, `referrals` and `ai_usage` and their rows are untouched but no longer read or written. The API routes for them answer 404.

If you later want the space back, back up first (`wrangler d1 export`) and then run in the D1 Console:

```sql
DROP TABLE IF EXISTS distribution_activities;
DROP TABLE IF EXISTS distribution_opportunities;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS referrals;
DROP TABLE IF EXISTS ai_usage;
```

Dropping is optional and cannot be undone. Do not delete rows from `settings`; account recovery uses it.

## Configuration you can remove

The Worker secret `GEMINI_API_KEY` and the variables `AI_ENABLED`, `AI_DAILY_LIMIT`, `GEMINI_FAST_MODEL` and `GEMINI_REASONING_MODEL` are no longer used.
