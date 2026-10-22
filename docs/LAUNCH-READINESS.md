# Launch readiness audit: findings and fixes

Method: code audit of the repository, API and UI tests with controlled fixtures. The live site could not be reached from the build environment, so nothing here claims live verification.

| Defect found | Root cause | Fix |
|---|---|---|
| Acquisition and usage showed `[object HTMLDivElement],...` | `section()` collected children as a rest array and received an array of cards, then `el()` flattened one level only, so the inner array was converted to text | One shared `el()` that flattens fully, plus tolerant renderers (`frontend/growth.js`, `frontend/session.js`) |
| Zero shown as if tracking worked; totals mixed across products | Legacy cards read `/analytics/summary`, an owner wide total that returns 0 when nothing is configured | Legacy visits, signups and activation cards removed. The per product `/products/:id/growth` view shows "External acquisition tracking is not configured." or real numbers, with zero only when tracking is configured |
| Stale metrics after switching products | Late responses overwrote newer ones | Request sequence guard in `growth.js` |
| Workspace discovery filtered only the first 24 products in the browser and matched free text categories | `renderDiscover` fetched page one and filtered client side | Workspace list now uses the same `/discover/products` query parameters as the directory, with paging, status text and debounce |
| Invalid filter values were ignored and returned everything | Backend only applied known values | Unknown pricing, stage, seeking and category return 400; the UI drops unknown URL values and says so |
| "Share listing" linked back to the same page | It appended `?product=` to the current URL and relied on a card existing on that page | Canonical `/p/<id>` URLs and a real share dialog (`frontend/share.js`) |
| No notifications | Only transient toasts existed | D1 backed notification centre (migration 0010, `/notifications` routes, `frontend/notifications.js`) |
| No log out on discover and product pages | `#logout-nav` was wired only by `app.js`, which those pages do not load | Shared `session.js` wires it when `app.js` is absent |
| "How it works" and footer links broken on non home pages | In page `#how` and `#home` anchors copied to every page | Links now point to `/#how` and `/` |
| Admin link in public navigation | Copied header | Removed from all pages (`/admin.html` remains reachable directly and is protected by the Worker) |
| Session expiry showed a generic error | 401 handling cleared state silently | Clear token, show "Your session expired" |
| Product pages invisible to crawlers and link previews | Static page, no per product tags | `functions/p/[id].js` injects title, description and Open Graph tags; `_redirects` serves the page if the function is not deployed |

## Removed or consolidated
- Legacy client side `renderDiscover` filtering and the `directoryProducts` cache in `app.js`.
- Legacy aggregate visits, signups and activation cards in the workspace.
- Duplicated fetch helpers in `directory.js`, `growth.js` and `notifications.js` (now `session.js`). `app.js` still has its own `api()`; merging it is a larger change not made here.

## Known limitations
- No email delivery exists, so notifications are in app only. `notifications.emailed_at` is reserved for a future provider.
- Link preview images are not generated (no image asset), so previews are text cards.
- Search is substring matching in SQL, case insensitive for ASCII only.
- Browser tests run in jsdom, not a real browser. Layout and touch behaviour still need a manual pass on phones.
- The privacy notice and terms are plain language drafts and should be reviewed by a lawyer before heavy promotion.
