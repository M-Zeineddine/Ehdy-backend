# Backend Audit — Phase 1: Recon & Structure

**Repo:** Kado / Ehdy gifting platform backend (`ehdy-backend` in package.json)
**Scope:** Structural + architectural map only. No code changed. Security deep-dive and
runtime verification deferred to Phase 2.
**Date:** 2026-07-08

---

## 1. Backend Map

### 1.1 Stack & runtime
- **Runtime:** Node.js. Dockerfile pins **node:18-alpine**; CI runs on **node 20**. No `engines`
  field in [package.json](package.json) — version is implicit and inconsistent between build (18)
  and CI (20).
- **Framework:** **Express 4** ([src/index.js](src/index.js)). Not Nest/Fastify.
- **Language:** Plain JS (CommonJS, `'use strict'`) for the backend. **TypeScript** only in the CMS.
- **Data access:** Raw **`pg` Pool** — no ORM, no query builder. All SQL is hand-written in services
  and route files. Central pool in [src/config/database.js](src/config/database.js), thin wrapper
  (`query` / `getClient` / `withTransaction` / `buildPagination`) in
  [src/utils/database.js](src/utils/database.js).
- **Supporting infra:** Redis (verification codes / OTP / rate-limit state), Bull (declared, usage
  minimal), node-cron background jobs, Winston logging, Swagger (dev-only).
- **External services:** Tap Payments (active), Stripe (legacy, still wired), Resend + Nodemailer/SMTP
  (email), VerifyWay (WhatsApp OTP), Twilio + SendGrid (declared in deps, not clearly used).

### 1.2 Server structure
Clean, conventional layering for the **user/merchant** surface:

```
routes/         Express routers, one per domain, mounted under /v1/* in index.js
controllers/    thin HTTP glue (req/res → service call → response envelope)
services/       business logic + SQL
middleware/     auth, validation, rate limiting, logging, error handling
utils/          db wrapper, token generation, formatters, qr, validators
config/         pg pool, redis, email, sms, stripe, tap, swagger
jobs/           node-cron scheduled tasks (expiring gifts, merchant balance sync)
migrations/     numbered .sql files + run.js runner
seeds/          seed scripts + JSON/SQL data
public/admin/   LEGACY vanilla-JS admin panel (NOT mounted — dead code)
```

Route mounting ([src/index.js:134-146](src/index.js#L134-L146)):
`/v1/auth`, `/v1/users`, `/v1/merchants`, `/v1/gift-cards`, `/v1/wallet`, `/v1/bundles`,
`/v1/gifts`, `/v1/notifications`, `/v1/merchant` (portal), `/v1/analytics`, `/v1/webhooks`,
`/v1/admin`, plus `/gift/:shareCode` (public HTML) and `/cms/*` (static Next.js export).

### 1.3 "Supabase" usage — important clarification
This project **does not use the Supabase platform** in any meaningful sense. It uses a **Postgres
database that happens to be hosted on Supabase**, reached over the standard pooler connection string.

Concretely:
- **No `@supabase/supabase-js`** anywhere (backend or CMS). Grep confirms zero imports.
- **No anon key / service_role key** — those concepts don't exist here. The only DB credential is the
  Postgres role `postgres` (superuser), embedded in `DATABASE_URL` / `DB_PASSWORD`.
- **No Row-Level Security.** No `CREATE POLICY`, no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in any
  migration. **All access control lives in the Node app layer.** The database trusts the app completely.
- **No Supabase Auth.** Auth is hand-rolled JWT (see below).
- **No Edge Functions / serverless.** Everything runs in the single Express process. The only
  "reaches Supabase directly" paths are humans: several migrations and seeds are annotated
  *"Run this in Supabase SQL Editor"* ([002](src/migrations/002_split_gift_cards.sql),
  [003](src/migrations/003_migrate_gift_card_fks.sql), seeds) — i.e. applied by hand via the dashboard.

So the "service key touching client-reachable code" question is moot in the Supabase sense, but the
equivalent risk **is present and worse**: the app holds a single **Postgres superuser** credential and
is the sole gatekeeper. There is no second line of defense (RLS) if an endpoint is missing an auth check.

### 1.4 Auth model
Three separate JWT-based identities, all **signed with the same `JWT_SECRET`**, distinguished by a
`type` claim, verified in [src/middleware/auth.js](src/middleware/auth.js):

| Identity | Login route | Token `type` | Middleware | Backing table |
|---|---|---|---|---|
| End user | `POST /v1/auth/signin` | `access` (no explicit type on user tokens) | `authenticate` | `users` |
| Merchant staff | `POST /v1/merchant/login` | `merchant` | `authenticateMerchant` | `merchant_users` + `merchants` |
| Admin (CMS) | `POST /v1/admin/login` | `admin` | `authenticateAdmin` | `admin_users` |

- Access tokens ~1h, refresh tokens 7d (`JWT_REFRESH_SECRET`). Admin token 8h, **no refresh**.
- Every authenticated request **re-fetches the identity row from the DB** (good: revocation on
  delete/deactivate is immediate; role is read from DB, never trusted from the JWT —
  [auth.js:168-177](src/middleware/auth.js#L168-L177), [auth.js:197-205](src/middleware/auth.js#L197-L205)).
- Passwords: bcrypt, cost 12 for users ([authService.js:13](src/services/authService.js#L13)), cost 10
  for admins ([admin.js:865](src/routes/admin.js#L865)).
- Email verification + phone OTP codes live in Redis with TTLs.
- **No token revocation / blocklist.** Logout is purely client-side (CMS deletes the cookie —
  [cms/lib/auth.ts:18](cms/lib/auth.ts#L18)).

### 1.5 CMS wiring
- **Next.js 15 + React 19 app** in [cms/](cms/), built as a **static export** (`output: 'export'`,
  `basePath: '/cms'` — [cms/next.config.ts](cms/next.config.ts)).
- The Express server serves the exported `cms/out` as **static files under `/cms`** with a hand-rolled
  SPA fallback ([src/index.js:148-170](src/index.js#L148-L170)). CMS and API are the **same origin /
  same deploy**.
- The CMS is a **pure API client** — it calls `/v1/admin/*` via axios ([cms/lib/api.ts](cms/lib/api.ts)),
  attaching the admin JWT from a cookie (`ehdy_admin_token`). It has **no server-side data access** and
  no Supabase access; it is just another consumer of the same Express API as the mobile app.
- Admin JWT is stored in a **cookie (`sameSite: 'strict'`, not `httpOnly` — it's set from JS)** plus a
  copy of the admin profile in `localStorage`.
- **The CMS content does not "reach the frontend"** in a headless-CMS sense — this "CMS" is an internal
  **admin dashboard** (users, merchants, categories, gifts, analytics, audit logs, settings), not a
  content pipeline feeding the mobile app. The mobile app reads the same operational tables via `/v1/*`.

### 1.6 Data flow (gift lifecycle, the core path)
1. User creates a **draft** → `POST /v1/gifts/create-draft` (`gift_drafts`).
2. Payment initiated via **Tap** (`giftController.initiatePayment`); a `gifts_sent` row is created
   `payment_status='pending'` with a unique 12-char share code
   ([tokenGenerator.js:24](src/utils/tokenGenerator.js#L24)).
3. Tap calls **`POST /v1/webhooks/tap`** ([src/routes/webhooks.js](src/routes/webhooks.js)). On
   `CAPTURED`, `fulfillGiftFromTap` ([giftService.js:642](src/services/giftService.js#L642)) creates a
   `gift_instances` row (redemption code + QR), flips `gifts_sent` to `paid`, and auto-adds to the
   recipient's wallet if a user with that phone already exists.
4. Recipient opens **`/gift/:shareCode`** → server-rendered HTML gift page
   ([src/routes/giftPage.js](src/routes/giftPage.js)). Only served when `payment_status='paid'`.
5. On signup/phone-verify, `claimPendingGiftsForPhone` back-fills wallet items for gifts sent to that
   phone before the account existed ([authService.js:156](src/services/authService.js#L156)).
6. Merchant redeems via portal: `validate-redemption` then `confirm-redemption`
   ([src/services/redemptionService.js](src/services/redemptionService.js)), using
   `SELECT ... FOR UPDATE` inside a transaction.

### 1.7 Build / env / test / CI
- **Build:** root `build` script just builds the CMS. Backend is not compiled (plain JS). Multi-stage
  Dockerfile builds the CMS then copies `cms/out` into the runtime image.
- **Env:** `dotenv` loaded in multiple entrypoints. **No schema/validation** of env vars, **no
  `.env.example`**. Defaults in code are dangerous (see findings).
- **Test:** Jest + supertest. Suites under `tests/unit`, `tests/integration`, `tests/security`.
  Integration auth test needs a real DB and is excluded by default.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs unit + integration + security tests
  with dummy JWT secrets on node 20. **No lint step, no CMS build, no DB provisioning, no secret
  scanning** despite eslint being configured.

---

## 2. Structural Findings

### Config & secrets

- **[Critical] `JWT_SECRET` / `JWT_REFRESH_SECRET` are placeholder strings** in
  [.env:20-21](.env#L20-L21) (`your-super-secret-jwt-key-change-in-production`). The code falls back to
  reading these directly. If this `.env` reflects any deployed environment, **all user, merchant, and
  admin tokens are forgeable**, and because a **single secret signs all three identity types**, a forged
  `{type:'admin'}` token grants full CMS access. This is the highest-priority item.
- **[Critical] Real production-grade secrets sit in the working-tree `.env`**: live Supabase Postgres
  **superuser password** (`DB_PASSWORD`, also embedded in `DATABASE_URL`), Tap secret key, Resend API
  key, VerifyWay API key, SMTP password ([.env](.env)). `.env` is correctly gitignored and **not**
  tracked in git (verified), but the file is present and these credentials should be considered exposed
  and rotated. There is no secret-management story (no vault, no CI secret injection beyond the dummy
  test values).
- **[High] Single all-powerful DB credential, no RLS.** `DB_USER=postgres` (superuser) is the only
  identity the app uses, and there is no row-level security anywhere. Any missing/incorrect auth check in
  a route is a direct data breach with no second layer. (Structural consequence of §1.3.)
- **[Medium] Inconsistent DB config paths.** [config/database.js](src/config/database.js) and
  [migrations/run.js](src/migrations/run.js) each re-implement pool config with divergent defaults
  (`ehdy_db` vs `kado_db` in docker-compose), and SSL is `rejectUnauthorized: false` in production —
  TLS without cert validation.
- **[Low] Duplicated/ambiguous DB creds in `.env`** — commented direct-connection URL plus active
  pooler URL, password repeated three times.

### Architecture — layering & separation

- **[High] `routes/admin.js` bypasses the entire controller/service architecture.** It is an 879-line
  router with inline SQL, bcrypt, and JWT signing directly in route handlers
  ([src/routes/admin.js:12-65](src/routes/admin.js#L12-L65) for login, and every handler below). Every
  other domain uses routes→controllers→services. The whole admin/CMS surface — the most privileged one —
  has no service layer, no reuse, and its own auth logic. This is the single biggest consistency/coupling
  problem.
- **[Medium] Two admin frontends; one is dead code.** [src/public/admin/app.js](src/public/admin/app.js)
  (1018 lines) + `index.html` + `styles.css` is a legacy vanilla-JS admin panel that is **not mounted**
  anywhere in `index.js` (only `/cms` static is served). It is stale, confusing, and duplicates the
  Next.js CMS's purpose.
- **[Medium] Dual payment stacks.** Tap is the live path (webhooks, `fulfillGiftFromTap`), but Stripe is
  still wired: [config/stripe.js](src/config/stripe.js), `stripe` dependency, and
  `giftController.initiatePayment/confirmPayment` plus `bundleService`/`bundleController` reference it.
  `stripe_*` columns persist on `users`/`merchants`. Unclear which is authoritative for bundles.
- **[Medium] Presentation logic embedded in the routing layer.**
  [src/routes/giftPage.js](src/routes/giftPage.js) is an 836-line file that is ~95% an inline HTML/CSS/JS
  template renderer. This is a view concern living in `routes/` with no templating engine.
- **[Low] Background jobs and webhook processing are fire-and-forget.** The Tap webhook responds `200`
  immediately then processes in `setImmediate` ([webhooks.js:49-51](src/routes/webhooks.js#L49-L51));
  a crash between ack and completion silently drops fulfillment (the `payment_webhooks` log helps, but
  there is no retry/reconciliation worker).

### API design

- **[Low] Consistent envelope and versioning.** All JSON responses use
  `{success, data|error, timestamp}` and live under `/v1/`. This is a genuine strength.
- **[Low] Verb-in-body RPC on REST routes.** `PATCH /v1/admin/merchants/:id` and
  `PATCH /v1/admin/users/:id` branch on a body `action` field (`verify`, `toggle_active`,
  `toggle_featured`, `deactivate`, `reactivate` —
  [admin.js:231-248](src/routes/admin.js#L231-L248), [admin.js:399-429](src/routes/admin.js#L399-L429)).
  Mixed REST/RPC; harder to authorize and document per-operation.
- **[Low] Mixed content types by prefix.** `/gift/*` serves HTML, `/v1/*` serves JSON, `/cms/*` serves
  static assets — acceptable, but note `/gift` sits outside the `/v1` rate-limited namespace.
- **[Low] `express.json` limit is 10mb globally** ([index.js:92](src/index.js#L92)) — large for a
  JSON API; broad DoS surface.

### Data layer

- **[High] Migration history does not describe the live schema; state is drifted.**
  - **Duplicate migration number 009**: [009_admin_cms.sql](src/migrations/009_admin_cms.sql) and
    [009_admin_users.sql](src/migrations/009_admin_users.sql) are near-identical. The runner sorts
    lexicographically and tracks by filename, so both "run", but numbering is no longer a reliable
    ordering key.
  - **Out-of-band DDL**: migrations 002/003 and several seeds are marked *"Run in Supabase SQL Editor"*
    and are therefore **not recorded** in the `_migrations` table. The repo cannot reproduce the
    database, and no one can be sure what actually ran.
  - **Heavy churn makes `001_initial_schema.sql` misleading**: it still defines `purchases`,
    `transactions`, `delivery_channel`, and a `gift_instances` shape that later migrations
    contradict. `delivery_channel` is dropped in [004](src/migrations/004_simplify_gift_delivery.sql)
    and re-added in [013](src/migrations/013_schema_cleanup.sql); `purchases`/`transactions` are dropped
    in [014](src/migrations/014_drop_dead_tables.sql). Reading `001` gives a false model of the DB.
- **[High] Local bootstrap is broken.** [docker-compose.yml](docker-compose.yml) seeds a fresh Postgres
  with **only `001_initial_schema.sql`**, so a `docker compose up` database is missing everything added
  after 001 (`merchant_items`, `merchant_branches`, `redemption_events`, `admin_users`,
  `payment_webhooks`, the `type`/`custom_credit_*` columns, etc.). The app cannot run against it.
- **[High — needs Phase 2 verification] Live code writes to a dropped table.**
  [redemptionService.js:207-219](src/services/redemptionService.js#L207-L219) `INSERT`s into
  `transactions` on every store-credit redemption that has a wallet owner, but
  [014_drop_dead_tables.sql](src/migrations/014_drop_dead_tables.sql) `DROP TABLE transactions CASCADE`.
  If 014 was applied to production, **redemption confirmation throws inside the transaction and rolls
  back** — a core-flow break. Because migration state is drifted (above), whether 014 actually ran is
  unknown; this must be confirmed against the real DB in Phase 2.
- **[Medium] Business logic is entirely in app code, not the DB.** No triggers, no DB functions, no RLS.
  Balance math, redemption state transitions, and gift fulfillment are all in JS. Concurrency is handled
  correctly where it matters via `SELECT ... FOR UPDATE`
  ([redemptionService.js:99-114](src/services/redemptionService.js#L99-L114)), but invariants (e.g.
  balance never negative beyond the one CHECK) are otherwise unenforced at the data layer.
- **[Low] Schema is otherwise sane**: UUID PKs, FKs, sensible CHECK constraints, good indexing including
  `pg_trgm` GIN for merchant search. Timestamp types were standardized to `TIMESTAMPTZ` late
  (migration 013) — earlier tables were naive `TIMESTAMP`.

### Auth (structural observations; deep-dive in Phase 2)

- **[Critical] Social login is an authentication bypass.** `socialLogin` never verifies the OAuth
  `id_token` — the comment literally says *"In production, you would verify the id_token"* — and
  authenticates purely on the `email` field in the request body
  ([authService.js:333-368](src/services/authService.js#L333-L368),
  [authController.js:72-75](src/controllers/authController.js#L72-L75)). `POST /v1/auth/social-login`
  with `{provider:'google', id_token:'anything', email:'victim@…'}` returns valid access+refresh tokens
  for (or silently creates) that account. Flagged structurally here; confirm and prioritize in Phase 2.
- **[High] Admin login has weaker brute-force protection than user login.**
  `POST /v1/admin/login` has **no `authLimiter`** ([admin.js:12](src/routes/admin.js#L12)); it is only
  covered by the global 100-req/15-min limiter, whereas user/merchant login use the 10-req/15-min
  `authLimiter`. The most privileged login is the least protected.
- **[High] Unauthenticated email-send endpoint.** `GET /test-email/:to`
  ([index.js:122-131](src/index.js#L122-L131)) sends real email to any address with no auth and no rate
  limit ("remove before production launch" — still present). Open email relay / abuse vector.
- **[Medium] No refresh-token rotation or revocation.** 7-day refresh tokens with no jti/blocklist;
  logout can't invalidate a stolen token.

### Tooling / guardrails that are missing

- **[High] No environment validation.** Nothing asserts `JWT_SECRET` is non-default or that required
  vars exist; the app boots happily with the placeholder secret. A startup env-schema check (envalid/zod)
  would have caught the Critical config issues.
- **[Medium] CI is thin.** No lint (eslint is configured but unused in CI), no CMS build check, no DB in
  CI (so integration/auth coverage is limited), no dependency/secret scanning.
- **[Medium] No `.env.example`** and no documented required-vars list; onboarding relies on the real
  `.env`.
- **[Low] No API contract tests / OpenAPI validation**; Swagger is hand-maintained via JSDoc and
  dev-only.
- **[Low] Dead code not pruned** (`src/public/admin`, Stripe path) inflates the audit surface.

---

## 3. Phase 2 Targets (deep + security inspection)

**Auth / access control (highest priority):**
- [src/services/authService.js:333](src/services/authService.js#L333) `socialLogin` — confirm the token
  is genuinely unverified end-to-end; treat as active auth bypass.
- [src/middleware/auth.js](src/middleware/auth.js) — single-secret multi-audience JWT design; check every
  `type`-claim comparison and whether any endpoint accepts the wrong identity class.
- [src/routes/admin.js](src/routes/admin.js) — full sweep: every handler is inline and privileged.
  Verify authz on each (esp. `POST /admins` superadmin gate, user/merchant mutation routes) and the
  missing rate limiter on `/login`.
- [src/routes/webhooks.js](src/routes/webhooks.js) — Tap signature verification correctness
  (`verifyTapSignature`), the `return true` skip when no key, timing-safe compare on attacker-controlled
  `hashstring` length, and idempotency/replay handling of duplicate webhooks.

**Core money/redemption flows:**
- [src/services/redemptionService.js](src/services/redemptionService.js) — the `transactions` insert vs
  the dropped table (confirm against live DB); balance math, partial-redemption edge cases, the disabled
  OTP gate (`OTP_VERIFICATION_ENABLED=false`).
- [src/services/giftService.js:642](src/services/giftService.js#L642) `fulfillGiftFromTap` — idempotency,
  wallet auto-add by phone, currency handling.
- Public [src/routes/giftPage.js](src/routes/giftPage.js) — XSS review of the manual HTML renderer and
  `escapeHtml` coverage (esp. interpolated URLs, QR data URIs, and the `branchesJson`/Leaflet script
  injection paths), and the share-code enumeration surface (`/gift/:shareCode`, outside `/v1` rate limits).

**Data layer / RLS:**
- Reconcile the **actual live schema** against `migrations/` — resolve the 009 duplicate, catalog the
  "run in SQL editor" DDL, and rebuild an authoritative baseline. This gates trusting anything else.
- Evaluate whether **any RLS** should back the superuser-only access model, or at minimum a
  least-privilege application DB role.
- Tables deserving policy/authorization review: `gifts_sent`, `gift_instances`, `wallet_items`,
  `redemption_events`, `admin_users`, `merchant_users`.

**Config & secrets:**
- Rotate everything in [.env](.env); introduce env-schema validation and a real secrets pipeline.
- `.env` handling across app / CMS build / Docker / CI.

**Guardrails:**
- Add lint + CMS build + secret scanning to [.github/workflows/ci.yml](.github/workflows/ci.yml).

---

## 4. Could Not Verify / Assumed

- **Whether `.env` reflects a real deployed environment.** If production injects real secrets and a
  real `JWT_SECRET` out-of-band, the two Critical config findings are downgraded — but the placeholder
  in-repo is still a live footgun. **Assumed** the file is representative because `DATABASE_URL` points
  at a real Supabase host and other keys look live.
- **Whether migration 014 (drop `transactions`) actually ran on production.** Migration state is drifted
  and partly applied by hand, so the `redemptionService` → dropped-table conflict could be either a
  live break or dormant. **Not verifiable without querying the real DB** (Phase 2, no code run here).
- **Which payment provider is authoritative for bundles/purchases.** Tap is clearly primary for gifts;
  Stripe code paths persist. **Assumed** Stripe is legacy but did not trace every bundle purchase path.
- **Actual production auth config** (real OAuth verification, real rate limits at a proxy/CDN layer).
  Reverse proxies / WAF / Supabase-side settings are outside this repo and **not assessed**.
- **Runtime behavior** — this phase read code only; nothing was executed, no endpoints were hit, no DB
  was inspected. All "this breaks" claims are static inferences to be confirmed in Phase 2.
- **Twilio / SendGrid usage** — present in dependencies; did not confirm whether any live path uses them
  vs Resend/VerifyWay.
- **`git` history for secret leakage** — confirmed `.env` is currently untracked/ignored, but did **not**
  audit whether secrets were committed in earlier history.
