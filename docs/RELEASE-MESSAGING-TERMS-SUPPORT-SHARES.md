# Release: messaging, terms acceptance, support email, share tracking (migration 0011)

## Messaging
- Every piece of feedback is a conversation (`voluntary` feedback and `test` feedback). Founder and sender can reply to each other.
- Each message shows the writer's display name, role (Founder, Tester or Product user), optional location and date and time. Role is worked out from the product: the owner is the Founder, someone who opted in to test is a Tester, everyone else is a Product user. Emails are never returned.
- Read state is per person per conversation (`thread_reads`). Own messages show Sent or Seen.
- Edit your own message for 24 hours; delete your own message at any time (a "This message was deleted" note stays so the conversation still makes sense). Original voluntary feedback can be edited and deleted by its writer; test feedback can be edited but not deleted because it is the recorded test result. Nobody else can edit or delete someone's message (403 for the other participant, 404 for outsiders).
- Routes: `GET /threads`, `GET|PATCH|DELETE /threads/:type/:id`, `POST /threads/:type/:id/messages`, `POST /threads/:type/:id/read`, `PATCH|DELETE /messages/:id`, `PATCH /auth/profile`. The earlier `POST /products/:id/general-feedback/:fid/respond` still works and now creates a message.
- Earlier single founder replies are copied into the new table by the migration. Nothing is deleted.

## Terms acceptance
- Current version: `TERMS_VERSION` in `worker/src/index.js` and `data-version` in `frontend/terms.html` (a test keeps them equal). To publish new terms, change both and the text, then deploy.
- Registration needs `accept_terms: true`. The version and time are stored on the user and in `terms_acceptances`.
- Existing accounts have no acceptance recorded, so after deploy they are asked on their next visit. Until they accept, the Worker answers any change request (not reading, login, logout or notifications) with `TERMS_REQUIRED`. The terms page lets people read before accepting.

## Support email
- `support.requva@gmail.com` is used on the contact page, footers, privacy and terms, the 404 page, login help and `frontend/config.js`.
- Requva sends no email today. Pages say so. Share buttons for email and Gmail only open the person's own mail app with a draft.

## Share tracking
- `POST /discover/share/:id` records a click on a share button in Requva's own dialog (copy link only after the copy succeeds, device share only after it completes). The same visitor and method count once per 10 minutes. Bots and empty user agents are ignored.
- Founders see shares in the growth workspace (period total, all time, by method, recent with date and time) and an all time count on each product card.
- What it means: it counts uses of Requva's share buttons. It does not show whether anyone opened or shared the product elsewhere.
