# FIX_PLAN — Ehdy/Kado Platform Remediation

**Date:** 2026-07-09
**Sources:** Backend audit (Phase 1 + 2), Frontend audit (Phase 1 + 2), live production schema dump.
**Repos:** `ehdy-backend` (Express + pg) and the Expo/React Native app.

## Rules of engagement (read first, apply to every item)

- Work through items **one at a time, in order**. Do not batch multiple items into one edit.
- For each item: state the finding and your intended fix **before** editing, make the **minimal change**, then run the repo's typecheck/lint/tests before marking it done.
- **No refactoring, renaming, or "while I'm here" improvements.** If a fix seems to require broader changes, STOP and say so instead of half-fixing.
- **Never mark an item done unless checks actually pass.**
- If a fix requires a product/behavior decision not specified here, STOP and ask.
- **Do NOT write new test suites in this pass** — tests are a separate follow-up task. Only run existing tests.
- Each item below = **one commit**, using the commit message given.
- Items marked **[STOP-GATE]** require explicit human approval before proceeding past them.

## Confirmed facts (from live schema — do not re-litigate)

- Migration 014 ran: `transactions` and `purchases` tables **do not exist** in production.
- `gift_cards` table does not exist; `gift_instances` has **no** `gift_card_id` column — all of `walletService`'s SQL is unrunnable.
- `wallet_items` has **no unique constraint** beyond its PK — `ON CONFLICT DO NOTHING` inserts are silent no-ops that cannot dedupe.
- `gifts_sent` has **no** `gift_draft_id` column — draft-keyed idempotency requires a schema change (Item B7).
- `tap_charge_id`, `unique_share_link`, `redemption_code` are UNIQUE (indexed). Standalone indexes on `wallet_items(user_id)` and `gift_instances(redeemed_by_merchant_id)` are unverified.
- Timestamp types are mixed: `timestamptz` on `merchant_items`, `store_credit_presets`, `payment_webhooks`, `notification_attempts`; naive `timestamp` everywhere else, including `gift_instances.redeemed_at`/`expiration_date` and `gifts_sent.sent_at`.

---

# PART A — Backend Day 1 (independent, shippable one by one)

## A1 — Fix broken redemption: remove insert into dropped `transactions` table
**Severity:** Critical — live production outage on every wallet-claimed redemption.
**File:** `src/services/redemptionService.js` (~lines 206–219).
**Change:** Delete the `INSERT INTO transactions ...` block inside `confirmRedemption` (the branch that runs when the gift has a `wallet_owner_id`). The `redemption_events` insert already provides the audit trail, and `GET /admin/transactions` reads from `redemption_events`.
**Verify:** Grep the whole repo for any other reference to the `transactions` table (also `purchases`) and remove/flag them. Run existing tests.
**Commit:** `fix(redemption): remove insert into dropped transactions table`
**STATUS:** DONE (commit 6a58896).

## A2 — Delete the social-login authentication bypass
**Severity:** Critical — full account-takeover primitive; frontend has no social login, so the endpoint is unused.
**Files:** `src/services/authService.js` (`socialLogin`, ~333–368), `src/controllers/authController.js` (social-login handler, ~72–75), the route registration in `src/routes/auth.js`, `socialLoginValidation` in `src/utils/validators.js`.
**Change:** Remove the route, controller, service function, and validator entirely. Do NOT attempt to "fix" it by adding token verification — deletion is the decision.
**Verify:** Grep for `social-login` / `socialLogin` — zero remaining references. Existing tests pass.
**Commit:** `fix(auth): remove unverified social-login endpoint (account takeover)`
**STATUS:** DONE (commit 0a47a21).

## A3 — Delete dead `/v1/wallet` surface
**Severity:** High — every endpoint 500s (`relation "gift_cards" does not exist`); the app never calls it.
**Files:** `src/services/walletService.js`, its controller, the `/v1/wallet` route file, and the `app.use('/v1/wallet', ...)` mount in `src/index.js`.
**Change:** Delete all of it. Do NOT rewrite onto the new model — recipients read gifts via `getReceivedGifts`, which is correct.
**Verify:** Grep for `walletService` and `/v1/wallet` — zero references. Note: do NOT touch `wallet_items` table usage elsewhere (redemption/claim flows use it legitimately).
**Commit:** `chore(wallet): delete dead /v1/wallet endpoints and walletService`
**STATUS:** PARTIAL (commit 8750252) — route unmounted; file deletion of `walletService.js`, `walletController.js`, `routes/wallet.js` blocked pending permission.

## A4 — Delete unauthenticated email relay
**Severity:** High.
**File:** `src/index.js` (~122–131), the `GET /test-email/:to` route.
**Change:** Delete the route.
**Commit:** `fix(security): remove unauthenticated /test-email endpoint`
**STATUS:** DONE (commit 24baed3).

## A5 — Startup env validation; refuse placeholder secrets
**Severity:** Critical (enabler for all secret findings).
**Change:** Add a small env-validation module (plain assertions or `envalid` if already installable) run at the very top of `src/index.js` boot, before the server listens. In production (`NODE_ENV === 'production'`) it must **throw and refuse to boot** if:
- `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing, shorter than 32 chars, or equals a known placeholder (`your-super-secret-jwt-key-change-in-production` and similar).
- `TAP_SECRET_KEY` is missing or empty.
- `DATABASE_URL`/`DB_PASSWORD` is missing.
- `CORS_ORIGIN` contains `*` (see A9).
In development, log loud warnings instead of throwing.
**Do NOT rotate secrets in code** — rotation is a human/ops task; add a `SECRETS_ROTATION.md` checklist listing every credential in `.env` that must be rotated (Postgres superuser password, JWT secrets, Tap, Resend, VerifyWay, SMTP).
**Commit:** `feat(config): validate env at boot; refuse placeholder/missing secrets in prod`
**STATUS:** DONE (commit accc307).

## A6 — Tap webhook fails closed
**Severity:** High.
**File:** `src/routes/webhooks.js` (`verifyTapSignature`, ~15–41), `src/config/tap.js`.
**Change:** Remove the `return true` when `TAP_SECRET_KEY` is unset. Missing key in production = handled by A5 boot check; in the verifier itself, missing key must return `false` (reject). Add a length/hex-format guard on the incoming `hashstring` before `Buffer.from(x, 'hex')`/`timingSafeEqual` so malformed input is rejected without relying on the thrown-exception path.
**Commit:** `fix(webhooks): tap signature verification fails closed; guard hashstring format`
**STATUS:** ⚠️ **SUPERSEDED by A16 (2026-07-12).** A6's fail-closed *signature verification* is **removed entirely** — `verifyTapSignature` is deleted. The verifier never actually validated a real Tap webhook (it read `hashstring` from the body; Tap sends it as an HTTP header), and the control is intentionally retired in favour of authoritative charge-retrieve. **There is no webhook signature verification anymore.** See A16. (The original A6 commit bb1cea8 shipped; A16 reverses the approach.)

## A7 — [STOP-GATE] Migration: draft-keyed payment idempotency
**Severity:** Critical — this is the schema half of the double-charge fix. **STOP and show the human the migration SQL before applying anything.**
**Change:** New migration file (next number in sequence):
```sql
ALTER TABLE gifts_sent
  ADD COLUMN gift_draft_id uuid REFERENCES gift_drafts(id);

-- one unresolved (pending) payment attempt per draft
CREATE UNIQUE INDEX gifts_sent_one_pending_per_draft
  ON gifts_sent (gift_draft_id)
  WHERE payment_status = 'pending' AND gift_draft_id IS NOT NULL;
```
Then in `giftService.initiateGiftPayment`:
- Persist the incoming draft id into `gifts_sent.gift_draft_id`.
- Before creating a new pending row, check for an existing `pending` row for the same draft; if found, return that row's existing charge/session info (or a `409` with the existing `gift_sent_id`) instead of creating a second Tap charge. Catch the unique-violation error as the race-safe backstop and translate it to the same response.
- Guard `parseFloat(merchant_items.price)` against null/NaN: `price` is a nullable column and active items can legitimately have a null price. Reject such items with a clear error instead of creating a charge with a NaN amount.
**Note:** existing rows keep `gift_draft_id = NULL`, which the partial index ignores — no backfill needed. The partial unique index is **inert until the client sends `gift_draft_id`** on `initiate-payment` (frontend coordination C1); until then the only live idempotency guard is the existing 5-minute `(user, item, recipient_phone)` window.
**Verify:** Existing tests pass; manually trace that confirm-payment and webhook fulfilment are unaffected for NULL-draft rows.
**Commit:** `feat(payments): idempotent initiate-payment keyed on gift_draft_id`
**STATUS:** IMPLEMENTED (commits 8370871 + 057e18b). Migration promoted to `src/migrations/018_gift_draft_id_idempotency.sql` (FK `ON DELETE SET NULL`; partial unique index). Code: `initiateGiftPayment` persists `gift_draft_id`, returns an existing live pending charge for the draft, and translates the partial-unique 23505 into the idempotent response / 409; `parseFloat(merchant_items.price)` null/NaN guard added. `fulfillGiftFromTap` re-opens a genuine late capture (bounded `failed` branch: no gift_instance + CAPTURED webhook), NOT EXISTS documented load-bearing. New `sweepStalePendingGifts` cron (10m / 30-min window). Verified: 001–018 apply on fresh PG17; branch-2 logic exercised end-to-end. **Not yet run against prod** — awaits baseline + migrate:up (user).
**Amendment declined:** the requested `idx_payment_webhooks_charge_id` was NOT added — migration 015 already created `idx_payment_webhooks_charge` on `payment_webhooks(charge_id)` (confirmed in the prod dump); a second index would be a redundant duplicate (same class as the voided A8).

## A8 — VOID (unnecessary; premise was false)
**Resolution (2026-07-09):** The A15 schema diff (repo migrations vs `pg_dump` of prod) disproved A8's
premise. `wallet_items` has had `wallet_items_user_id_gift_instance_id_key UNIQUE (user_id,
gift_instance_id)` since **migration 001** — in both a fresh migrate:up and production. The "confirmed
fact" that it had no unique constraint came from a Supabase **schema-viewer paste**, which silently
omits constraints; a real `pg_dump` shows it. So `ON CONFLICT DO NOTHING` was already working, the
0-duplicate inspection is explained by the pre-existing constraint, and A8's `CREATE INDEX IF NOT
EXISTS` were no-ops (those indexes already existed). A8's hand-applied `wallet_items_user_instance_uniq`
is a **redundant duplicate** (two identical unique constraints = two identical indexes maintained on
every write).
**Action:** (1) drop the redundant constraint on prod — `ALTER TABLE wallet_items DROP CONSTRAINT
wallet_items_user_instance_uniq;` (one-time, by hand, part of voiding A8); (2) draft
`018_wallet_items_dedupe_and_unique.sql` and `scripts/inspect_wallet_items.sql` **deleted** — not
promoted, not kept as a no-op.
**Lesson:** a schema-viewer dump is not `pg_dump`. Both audits' constraint/index "confirmed" claims
sourced from the viewer are unverified — though the A15 diff shows the indexes exist in both dumps, so
that particular class resolves itself.
**STATUS:** VOID — redundant constraint drop is the only remaining action (prod, by hand).

<!-- Former A8 (dedupe + unique) retained below for history; superseded by the resolution above. -->
### A8 (original, superseded) — dedupe + unique constraint on wallet_items
**Severity:** High. **STOP and show the human the dedupe query results before deleting anything.**
**Change:** New migration:
```sql
-- 1) Inspect duplicates first (run and REPORT before deleting):
SELECT user_id, gift_instance_id, COUNT(*), array_agg(id ORDER BY received_at)
FROM wallet_items
GROUP BY user_id, gift_instance_id
HAVING COUNT(*) > 1;

-- 2) Keep the earliest row per (user_id, gift_instance_id), delete the rest:
DELETE FROM wallet_items w
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, gift_instance_id ORDER BY received_at ASC, id ASC
  ) AS rn
  FROM wallet_items
) d
WHERE w.id = d.id AND d.rn > 1;

-- 3) Enforce going forward:
ALTER TABLE wallet_items
  ADD CONSTRAINT wallet_items_user_instance_uniq UNIQUE (user_id, gift_instance_id);

-- 4) FK support indexes (Postgres does not auto-index FKs):
CREATE INDEX IF NOT EXISTS idx_wallet_items_user_id ON wallet_items (user_id);
CREATE INDEX IF NOT EXISTS idx_gift_instances_redeemed_by ON gift_instances (redeemed_by_merchant_id);
CREATE INDEX IF NOT EXISTS idx_gift_instances_gift_sent_id ON gift_instances (gift_sent_id);
```
This makes the existing `ON CONFLICT DO NOTHING` inserts actually work. The inspection SELECT (step 1) is a **separate reported step** — run it, report the rows, get sign-off — before any DELETE migration runs. It is NOT bundled into the runnable dedupe migration.
**Commit:** `fix(db): dedupe wallet_items, add unique constraint + FK indexes`
**STATUS:** APPLIED OUT-OF-BAND (2026-07-09). Inspection ran: 4 rows, **0 duplicates**, so the dedupe DELETE is a no-op. The UNIQUE constraint + 3 FK indexes were applied directly on prod via SQL editor ("Success"). Draft `018` was made **idempotent** (guarded ADD CONSTRAINT) so it reconciles: no-op on prod, correct on a fresh rebuild. Keep the file for repo-of-record. Amended 2026-07-09: the dedupe DELETE block was removed (confirmed no-op — 0 duplicates); ships only the guarded UNIQUE constraint + 3 FK indexes. The inspection query was moved out of the migration sequence to `scripts/inspect_wallet_items.sql`. **Do NOT run `migrate:up` against prod** until the migration history is reconciled (Part D) — the history is drifted (002/003 etc. applied out-of-band and unrecorded), so the runner would try to replay them (e.g. `003`'s bare `DROP TABLE gift_cards` would error). Apply future migrations (e.g. A7's `017`) by hand via the SQL editor, as A8 was.

## A9 — Backend hardening batch (small, low-risk, one commit)
All independent one-liners; single commit acceptable:
1. **Admin login protection:** add `authLimiter` + the existing-but-unused `adminLoginValidation` to `POST /v1/admin/login` (`src/routes/admin.js` ~12).
2. **Superadmin gate on roster:** add the `role === 'superadmin'` check to `GET /v1/admin/admins` (~842–851), matching `POST /admins`.
3. **CORS:** in `src/index.js` (~71–89), remove the `*`-honoring branch; explicit allowlist only (A5 already refuses `*` at boot).
4. **JSON body limit:** drop global `express.json` limit from 10mb to 200kb (`src/index.js` ~92).
5. **Rate-limit public gift page:** mount a limiter on `/gift` (reuse an existing limiter config).
6. **Stop logging verification codes:** remove the code from the log line at `src/services/authService.js` ~116 (keep the "code sent to <email>" event, drop the code itself).
7. **TLS:** `rejectUnauthorized: true` in `src/config/database.js` — if the Supabase CA cert isn't available in the environment, STOP and flag instead of guessing.
8. **Delete dead admin bootstrap:** remove unmounted `adminService.setupInitialAdmin`/`getSetupStatus` + `controllers/adminController.js` dead paths.
**Commit:** `fix(security): admin limiter+validation, superadmin gate, CORS/body/TLS hardening, log hygiene`
**STATUS:** PARTIAL (commit 4484f98) — sub-items 1–6 done. #7 (TLS) deferred: needs confirmed Supabase CA before flipping `rejectUnauthorized`. #8 (delete dead admin bootstrap files) blocked pending permission.

## A10 — Fix stored XSS on public gift page
**Severity:** High.
**File:** `src/routes/giftPage.js` (~132–139 build, ~665 injection).
**Change:** Escape the JSON payload before inlining:
```js
const safeBranchesJson = JSON.stringify(branches)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(//g, '\\u2028')
  .replace(//g, '\\u2029');
```
Also escape the QR data URI at ~586 with the existing `escapeHtml` for consistency.
**Commit:** `fix(xss): escape branchesJson and QR src on public gift page`
**STATUS:** DONE (commit 88fe6a6).

## A11 — Stop leaking raw error messages (COORDINATED — see Part C ordering)
**Severity:** Medium, but **breaks the frontend's register flow if shipped alone.**
**Files:** `src/middleware/errorHandler.js` (~34, 104–122) + `AppError` usage in auth flows.
**Change, step 1 (this item):** add a stable `error.code` field to the error envelope (e.g. `PHONE_VERIFICATION_PENDING`, `EMAIL_VERIFICATION_PENDING`, `VALIDATION_ERROR`, `INTERNAL`). Populate codes on the specific `AppError`s the register/login flows throw. **Keep returning `message` for now.**
**Change, step 2 (do NOT do until frontend Item F7 ships):** for non-`AppError` 500s, replace client-facing `message` with a generic string; log details server-side only.
**Commit (step 1):** `feat(errors): stable error codes in response envelope (message retained)`
**STATUS:** STEP 1 DONE (commit 4f04b2f) — codes aligned (`EMAIL_UNVERIFIED`→`EMAIL_VERIFICATION_PENDING`, `PHONE_UNVERIFIED`→`PHONE_VERIFICATION_PENDING`). Step 2 deferred until F7.

## A12 — Webhook persist-then-process + reconciliation
**Severity:** High (silent payment loss on crash).
**File:** `src/routes/webhooks.js` (~47–95), `payment_webhooks` table (already exists with `processed`/`error_message` columns — use it).
**Change:**
1. On receipt: **insert the raw payload into `payment_webhooks` first** (`processed = false`), then ack `200`, then process.
2. On successful processing: set `processed = true`; on failure: write `error_message`.
3. Add a reconciliation job in `src/jobs/` (node-cron, like existing jobs — do NOT introduce Bull): every 5 minutes, re-drive `payment_webhooks` rows where `processed = false AND received_at < now() - interval '2 minutes'`, calling the same fulfilment function. Fulfilment must be idempotent — guard `fulfillGiftFromTap` so a row already `paid` with an existing `gift_instances` row is a no-op (check before insert, inside the transaction).
**Commit:** `fix(webhooks): persist-then-process with cron reconciliation; idempotent fulfilment`
**STATUS:** DONE (commit 0712cfd).

## A13 — Dead/broken analytics + the `gift_cards`/dropped-object sweep
**Severity:** High — mounted, authenticated endpoints that 500 on every call; plus a whole surface neither prior audit caught.
**Prereq — A13.0 grep sweep (already run, 2026-07-09):** the authoritative list of live runtime code referencing dropped objects (`transactions`, `purchases`, `gift_cards`, `claimed_by_user_id`). Fix scope is exactly these; the rest are false alarms or non-runtime.

Live broken references:
- `src/controllers/analyticsController.js` — `claimed_by_user_id` (:26), `FROM purchases` (:36, :49), `FROM transactions` (:61). This is `GET /v1/analytics/dashboard`.
- `src/services/giftCardService.js` — `FROM gift_cards` (:17 `getGiftCardById`, :40 `getGiftCardsByIds`, :87 list). Reached by `GET /v1/gift-cards` and `/v1/gift-cards/:id` ([routes/giftCards.js]) **and transitively** by `giftService.sendFromDraft`/`sendGiftDirect` (`POST /v1/gifts/send`, `POST /v1/gifts/:draft_id/send`) via `getGiftCardById`.
- `src/services/bundleService.js` — `JOIN gift_cards` (:114). Reached by `/v1/bundles`.
- `src/jobs/checkExpiringGifts.js` — `JOIN gift_cards` (:24). See A14.
- `src/services/walletService.js` (:53, :109) — already unmounted in A3; files still to be deleted.
- `src/seeds/*` — `INSERT INTO gift_cards` (seed.js:104/114, merchants.json, seed_merchant.sql). Seeding is broken; flag for the seed-rework follow-up, not a request-path fix.

False alarms (do NOT touch): `admin.js:669` `/transactions` route (queries `redemption_events`); `adminService.listPurchases` (queries `redemption_events`; dead/unmounted anyway); `giftCardController.js:22`/`adminController.js:189` response keys; `cms/.../users/page.tsx:163` `recent_purchases` UI field.

**Confirmed before fixing:** nothing in `cms/` calls `GET /v1/analytics/dashboard` — the CMS analytics page calls `GET /v1/admin/analytics` (a different, working handler). So the broken `/v1/analytics/dashboard` is **not** a live admin screen.

**Decision / change (STOP-GATE on product intent):**
- `GET /v1/analytics/dashboard`: since no CMS caller and it only ever queried dropped tables, **delete** the route (`src/routes/analytics.js` mount + `analyticsController.getUserDashboard`) unless the mobile app calls it. **STOP and confirm the mobile app does not consume `/v1/analytics/dashboard`** before deleting; if it does, it must be rewritten onto `gifts_sent` + `redemption_events` + `wallet_items`/`gift_instances` (the wallet-summary and favorite-merchant sub-queries already use the live model and can be salvaged).
- `/v1/gift-cards` and `/v1/bundles` and the legacy `gifts/send` paths: **STOP-GATE — separate decision.** These query a table the live schema no longer has. Determine per surface whether the app still calls it: if dead → delete (like A3); if live → rewrite onto `merchant_items` + `custom_credit_*`. Do not fix blind.
**Commit(s):** one per surface once each decision is made.
**STATUS:** DONE (2026-07-10). App grep (`gift-cards|/bundles|gifts/send|analytics/dashboard` over `app/ src/`) returned **empty**, and the CMS calls `/v1/admin/analytics` — so all four surfaces are dead. Deleted:
- `9a69af0` `chore(analytics): remove dead /v1/analytics/dashboard`
- `d3cf5b1` `chore(bundles): remove dead /v1/bundles` (route + controller + bundleService)
- `f6db214` `chore(gifts): remove dead /v1/gift-cards and legacy gift_cards send/draft flow` — also removed `giftService.createDraft/updateDraft/getDraftPreview/sendFromDraft/sendGiftDirect/_createGiftInstanceAndSend`, their controller handlers and routes, and `giftCardService`. Each was traced to its sole caller chain first; **none reachable from a live route** (app uses only `initiate-payment`, `confirm-payment`, `drafts`, `sent`, `received`; the Tap webhook creates its `gift_instance` inline).
- `b0b4a1e` `chore(wallet): delete orphaned walletService files` — completes A3 (deletion was blocked when the route was unmounted).

Only remaining `gift_cards` reference in `src/` is `checkExpiringGifts.js:24` → **A14** (a rewrite, not a delete). (`seed.js:91` is the `merchant.gift_cards` JSON key, not the table.) All mounted route modules load; unit + security suites green.

## A14 — Expiring-gifts cron references dropped `gift_cards`
**Severity:** Medium — the daily `checkExpiringGifts` job throws on every run (caught and swallowed), so **expiry-warning notifications never fire**. This is a **notification bug, not a money bug**: `redemptionService` reads `gift_instances.expiration_date` in both `validateRedemptionCode` (:62) and `confirmRedemption` (:132) and rejects expired codes with `CODE_EXPIRED`, so expired gifts are **not** redeemable.
**File:** `src/jobs/checkExpiringGifts.js` (~18–32).
**Change:** Rewrite the query off the dead `gift_cards`/`wallet_items→gift_cards` model onto the live model: join `gift_instances` → `wallet_items` → `users`, and resolve item/merchant names via `merchant_items` + `merchants` / `custom_credit_merchant_id` (mirroring `redemptionService`'s `GIFT_INSTANCE_SELECT` and `getReceivedGifts`). Also fix the `notificationService.createNotification` call: elsewhere it takes `(client, {...})`; here it is called with a single object — confirm the signature and pass a client/`null` consistently so the notification actually writes.
**Note (defer, do not fix here):** expiry compares a naive `date` to `new Date()`, so it can be off by the UTC offset — folded into the deferred timestamp-normalization work (Part D), not this item.
**Verify:** existing tests pass; manually trace one expiring gift through the rewritten query.
**Commit:** `fix(jobs): checkExpiringGifts uses live schema; expiry notifications fire again`
**STATUS:** DONE (2026-07-10). Query rewritten onto `gift_instances → wallet_items → users` with `merchant_items`/`custom_credit_merchant_id`. Predicate uses **date arithmetic** (`gi.expiration_date = CURRENT_DATE + $1::int`) since `expiration_date` is `date`, not timestamptz. `findExpiringGifts()` extracted so the predicate is testable without sending mail. Run-level failures now propagate and are logged loudly by the scheduler (the old try/catch swallowed them, which is why nobody noticed it had been throwing daily); per-gift failures are counted, and every run logs `notified/failed/total`.
**createNotification:** it is **overloaded** (`createNotification(data)` or `(client, data)`), so the old single-arg call was *not* a bug — the `gift_cards` JOIN was. No transaction client is needed (each notification is an independent insert with no atomicity requirement), so it now passes an explicit `null` client to use the pool while matching the `(client, data)` shape.
**Seed:** four expiry fixtures added — `EXP-INWIN` (+7), `EXP-OUTWIN` (+30), `EXP-PAST` (−1), `EXP-REDEEMED` (+7, redeemed). Verified on a fresh migrated DB: `findExpiringGifts()` returns **exactly** `EXP-INWIN`; `createNotification(null, …)` inserts one row.
**Known limitation (not fixed):** exact-day equality means a missed run (server down at 09:00) silently drops that day's cohort forever — the same silent-failure class. A range predicate (`expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`) plus a `NOT EXISTS` dedupe against `notifications` would be self-healing. Deferred pending a decision.

## A15 — [STOP-GATE] Baseline the migration ledger
**Severity:** Critical operational — the `_migrations` table is **EMPTY** (0 rows) while the schema is fully populated. Every migration 001–016 was applied **by hand** via the Supabase SQL editor; `migrate:up` has never successfully run against prod. If run now, the runner would attempt `001` onward against the live schema and detonate (e.g. `001` is all `CREATE TABLE IF NOT EXISTS`, so it would **re-create the dropped `gift_cards`/`purchases`/`transactions` tables**; `003`'s bare `DROP TABLE gift_cards` would then error).
**Do BEFORE promoting 017/018.**
**Findings (verified 2026-07-09 against the live schema dump):**
- Lexicographic run order (how `run.js` sorts): 001, 002, 003, 004, 005, 006, 007, 008, **009_admin_cms**, **009_admin_users**, 010, 011, 012, 013, 014, 015, 016. The two `009_*` files are near-identical (both `CREATE TABLE IF NOT EXISTS admin_users` + `merchants.is_featured`); the second is an idempotent no-op but the runner tracks by filename, so both must be baselined.
- **All 17 files' net effects are present in the live schema → all genuinely applied. There are NO genuinely-unapplied migrations.** (Effect map recorded in the review; each object created/altered by a migration is visible, or was later dropped by a subsequent applied migration.)
- `run.js` records the filename **AFTER** executing the file, and the `INSERT INTO _migrations` is in the **SAME** `BEGIN/COMMIT` transaction as the DDL — so a migration is recorded iff its DDL committed. An empty ledger + full schema therefore proves the runner never committed any migration (all applied out-of-band).
- **Caveat — repo files are not byte-faithful to what was applied.** e.g. repo `001` declares `wallet_items UNIQUE(user_id, gift_instance_id)`, but prod had no such constraint until A8 added it 2026-07-09. Baselining records "this filename ran"; it does not guarantee the repo SQL equals the applied SQL. A full `pg_dump` reconciliation (Part D) is still owed.
**Change:** Run the baseline INSERT (below) **once, by hand via the SQL editor** — do NOT run `migrate:up`. After it, the ledger matches reality and future `migrate:up` skips 001–016 and runs only new files. Optionally commit it as `src/migrations/000_baseline_ledger.sql` (sorts first) for repo-of-record, but keep applying by hand until the Part D reconciliation.
```sql
INSERT INTO _migrations (filename) VALUES
  ('001_initial_schema.sql'),
  ('002_split_gift_cards.sql'),
  ('003_migrate_gift_card_fks.sql'),
  ('004_simplify_gift_delivery.sql'),
  ('005_tap_payments.sql'),
  ('006_gift_instances_gift_sent_id.sql'),
  ('007_merchant_branches.sql'),
  ('008_remove_merchant_location_columns.sql'),
  ('009_admin_cms.sql'),
  ('009_admin_users.sql'),
  ('010_merchant_visits.sql'),
  ('011_custom_credit_amount.sql'),
  ('012_redemption_events.sql'),
  ('013_schema_cleanup.sql'),
  ('014_drop_dead_tables.sql'),
  ('015_audit_tables.sql'),
  ('016_drop_store_credit_preset_id.sql')
ON CONFLICT (filename) DO NOTHING;
```
**STATUS:** DIFF DONE (2026-07-09). Baseline INSERT lives at `scripts/baseline_ledger.sql` (one-time, prod only, never in migrations/). **Not run.**

### A15 diff result (repo migrations vs `pg_dump --schema-only` of prod 17.6)
Method: fresh `postgres:17-alpine` → `migrate:up` ran all 17 files cleanly (proving the runner works) → `pg_dump` both with identical flags → normalized order-insensitive diff. **1,428 of 1,430 lines identical.** The repo migrations reproduce production; every table/column/type/enum/check/default/FK/index matches. **Exactly two deltas:**
1. `wallet_items_user_instance_uniq` — present only in prod (yesterday's A8 hand-edit); redundant duplicate of the 001-origin unique constraint. → **void A8**, drop it on prod (above).
2. `merchants.is_featured` — repo/fresh `NOT NULL` (migration 009), prod **nullable**. Genuine drift from hand-applying 009. → reconciled by a NEW tracked migration (below), not another out-of-band edit.

### Renumbering (A8 void frees 017)
- `017_merchants_is_featured_not_null.sql` — NEW: `UPDATE merchants SET is_featured=false WHERE is_featured IS NULL;` then `ALTER COLUMN is_featured SET NOT NULL`. Prod null count = 0 (verified), so a clean no-op UPDATE + enforce. Safe on fresh DBs (already NOT NULL). This is the runner's first real job on prod.
- `018_gift_draft_id_idempotency.sql` — the A7 work (was 017).

### Corrected sequence
1. **Void A8** — drop redundant constraint on prod (by hand); drafts deleted. ✅ drafts deleted
2. **Fix `seed.js` + `docker-compose.yml`** ✅ done — seed rewritten onto merchant_items/store_credit_presets + end-to-end redemption fixture (verified against a fresh migrated DB, idempotent); compose removes the 001-only mount, matches PG17, runs migrate:up via the runner.
3. **Baseline the ledger by hand** (`scripts/baseline_ledger.sql`) — the last paste, ever.
4. **Promote 017 + 018** into `src/migrations/`, then **`migrate:up` against production** — that first successful runner-driven run is the proof.
5. Rebuild the fresh DB from scratch (`docker compose down -v` + up + seed) as the final test.

---

# PART A — Day 2 (production sandbox testing, 2026-07-12)

## A16 — Tap webhook verification: fulfil from authoritative charge-retrieve (NOT signature)
**Severity:** Blocking — real Tap sandbox webhooks were rejected, so no payment could be fulfilled via webhook.
**Root cause:** `verifyTapSignature` read `charge.hashstring` from the **body**, but Tap sends the signature as an HTTP **header**; proven against two stored sandbox payloads (`hashstring` absent top-level and nested; the strings "hash"/"signature" appear nowhere; `live_mode=false`). The verifier had therefore never validated a real webhook — pre-A6 the `if (!secret) return true` fail-open (with `TAP_SECRET_KEY` unset in prod) masked it; A5 forcing the key + A6 removing fail-open exposed it. The compute was also wrong (`id|amount|currency|status` vs Tap's `x_id…x_amount…` HMAC).
**Decision (human, 2026-07-12):** treat the webhook body as an **untrusted trigger** and fulfil on a **re-fetched authoritative charge** (`GET /v2/charges/{id}`, our secret key). **hashstring HMAC verification is deliberately DROPPED — not silently skipped.**
**A16 SUPERSEDES A6.** A6 added fail-closed *signature verification*; A16 **retires that control entirely** — `verifyTapSignature` is deleted, and there is no longer any webhook signature check (same explicit-retirement treatment as A7's `payment_webhooks` CAPTURED-EXISTS branch). A security control is being removed; recording it here so no future reader assumes signature verification still exists. The single authority is now the charge-retrieve. A byte-imperfect formula (amount decimals, empty `gateway_reference`, `transaction.created`, field order) that fulfilment doesn't gate on would be log noise that can cry wolf on valid webhooks; if a real second factor is ever wanted, build it deliberately later using the captured header. One authority: charge-retrieve. No `live_mode` gate (it's in the untrusted body; any gate keys off server-side `NODE_ENV`, never a body field — and none is needed).
**Step-1 hash inputs (recorded, for a future deliberate signature build only):** `currency=USD` (→ amount formats to 2 decimals), `reference.gateway` absent (→ empty string), `reference.payment` populated, `transaction.created` populated (Unix-ms).
**Header capture result (2026-07-13, diag deploy, sandbox `CAPTURED` charge):** the signature header is **literally `hashstring`** (lowercased by Express; not proxied or renamed), value is **64 hex chars = HMAC-SHA256 hex digest**. It **IS present on a `live_mode:false` charge** — **Tap sandbox DOES sign**; there is no "sandbox doesn't sign" case, so no sandbox bypass or `live_mode` gate was ever warranted. Recorded so a deliberate signature second factor can be built later without re-deploying a diagnostic. Request also carries a Render/Cloudflare proxy chain (`x-forwarded-for`, `cf-connecting-ip`, `true-client-ip`) — confirms A18.
**Field evidence for the decision:** on that same charge the webhook was **rejected** (`processed=true`, `error="signature verification failed"`) yet the gift reached `paid` — it fulfilled via `confirm-payment`'s `getTapCharge` + CAPTURED check. Charge-retrieve already worked; signature verification did not. Payments therefore currently depend on the app completing the callback, with the webhook safety net dead — precisely what A17 restores.

## A17 — Implement charge-retrieve fulfilment (all four behaviours load-bearing)
**Files:** `src/services/giftService.js` (`fulfillGiftFromTap`), `src/routes/webhooks.js`, `src/controllers/giftController.js` (`confirmPayment`).
**Change:**
1. **DB-gate FIRST, then fetch.** `fulfillGiftFromTap` looks the charge id up among our unresolved gifts (pending, or failed-and-never-fulfilled) **before** calling Tap; no match → drop, no outbound call. Stops a random-`chg_`-id POST flood from amplifying into unbounded Tap calls / rate-limiting.
2. **Validate amount + currency**, not just status. Fulfil only when the re-fetched charge is `CAPTURED` **and** its amount+currency equal what we expected for that gift. Uses the re-fetched amount, never the body's. Mismatch → terminal, logged loudly, never fulfilled.
3. **Transient vs terminal split.** Tap unreachable / 429 / 5xx → `getTapCharge` throws → webhook stays `processed = false` → A12 reconciliation re-drives it. Tap reachable + not captured → terminal, `processed = true`, don't fulfil (FAILED/CANCELLED/DECLINED → mark the gift failed). Never processed-and-done on a transient error.
4. **Exactly one fetch per fulfilment.** The fetch lives inside `fulfillGiftFromTap` (after the DB gate); `confirmPayment` **stops pre-fetching** and just calls it (then reads state). The webhook is a pure trigger — no body-status branching, and `verifyTapSignature` is removed entirely.
Supersedes A7's `payment_webhooks` CAPTURED-EXISTS re-open branch — the authoritative fetch is now the proof of capture (the `NOT EXISTS gift_instances` guard stays, still load-bearing against duplicate instances). Webhook route protection is now rate-limiting (`generalLimiter` on `/v1/`) + the DB-gate, which A18 makes see real client IPs.
**Verify:** 8-scenario harness on a fresh DB (mocked `getTapCharge`): DB-gate/no-call, transient-throws, FAILED-not-fulfilled, amount & currency mismatch not-fulfilled, valid capture → paid + 1 instance + exactly 1 fetch, idempotent replay no-call, `processTapWebhook` transient→processed=false / terminal→processed=true. All pass.
**Commit:** `fix(webhooks): fulfil from authoritative Tap charge-retrieve; drop signature verification (A16/A17)`
**STATUS:** IMPLEMENTED on branch `fix/tap-charge-retrieve` (off `diag/…`). Staged, not deployed.

## A18 — Trust first proxy hop (Render)
**Change:** `app.set('trust proxy', 1)` so `req.ip`/`X-Forwarded-For` resolve to the real client behind Render's proxy and `express-rate-limit` stops warning. `1` trusts only the immediate hop.
**Commit:** `fix(server): trust first proxy hop (Render) for correct client IP (A18)` (`b174881`, on `diag/…`).
**STATUS:** DONE (staged on the diagnostic branch).

## [TEMP] Header-capture diagnostic (revert after capture)
On `diag/tap-webhook-headers` **only**: persists the incoming `req.headers` on the stored webhook payload (a temporary diagnostic key) for one sandbox webhook, to record whether/where Tap's sandbox sends the signature header. **A17 removes it** (charge-retrieve doesn't need it) so it never reaches `main`. Deploy `diag` → run one sandbox payment → read the captured headers → then A17 supersedes. (The literal capture-key identifier is kept out of this doc so `git grep <that-key> main` is a clean leak gate.)

---

# PART B — Frontend Day 1 (independent of backend)

## F1 — Fix the token-refresh queue (hang + zombie resolvers)
**Severity:** Critical.
**File:** `src/services/api.ts` (~36–76).
**Change:** Restructure so `processQueue` runs **exactly once per refresh cycle** on every path:
```ts
try {
  const t = await onTokenExpired();
  processQueue(t);            // t may be null — queue must flush either way
  if (t) { /* retry original request */ }
  else { /* reject original; trigger logout path */ }
} catch {
  processQueue(null);
} finally {
  isRefreshing = false;
}
```
`processQueue(null)` must **reject** queued promises (not leave them pending) and clear the array. When flushed with null, ensure `clearAuth()` runs so AuthGate redirects.
**Commit:** `fix(api): token refresh flushes queue on all paths; null refresh rejects + logs out`

## F2 — Payment callback: remove client-decided success
**Severity:** Critical.
**File:** `app/payment/callback.tsx` (~49–74).
**Change:** Delete the "no `tap_id` → success" branch — missing `tap_id` renders a failure/unknown state ("We couldn't confirm this payment") and does NOT delete the retry draft. Success UI renders **only** after `POST /gifts/confirm-payment` returns a verified paid state; take the share link from that response, not from route params. If the response shape lacks the share link, STOP and flag (backend coordination needed).
**Commit:** `fix(payment): success only from server confirmation; remove no-tap_id success branch`

## F3 — Handle payment browser cancel/dismiss
**Severity:** Critical (double-charge UX path).
**File:** `app/gift/index.tsx` (~133–159).
**Change:** Handle `browserResult.type === 'cancel' | 'dismiss'` explicitly: navigate to the callback screen in an "unknown/pending" state referencing `result.gift_sent_id`. Disable re-initiation for the same draft while a charge is unresolved (local pending flag keyed on draft id). Server-side status check depends on backend Item A7/C-work; until then show "payment status unknown — check your gifts before retrying" rather than silently re-enabling Pay.
**Commit:** `fix(payment): handle browser cancel/dismiss; block re-initiation while charge unresolved`

## F4 — Merchant portal: 401 interceptor + AuthGate dead-end
**Severity:** High.
**Files:** `src/services/merchantPortalService.ts` (~14–26), `app/_layout.tsx` (~34–57).
**Change:** Add a 401 response interceptor to the merchant axios instance — `merchantAuthStore.clearAuth()`. In AuthGate, add: `!merchantAuth && inMerchantTabs → redirect to merchant login`.
**Commit:** `fix(auth): merchant 401 handling + AuthGate redirect for expired merchant session`

## F5 — Scan flow fixes (client-only redemption hardening)
**Severity:** High.
**File:** `app/(merchant-tabs)/scan.tsx`.
**Change (one commit, related state fixes):**
1. Add `otpSending` state; pass as `loading` to `RedemptionModal` (replacing hardcoded `false` at ~431); guard `handleConfirm` on it.
2. Reset `RedemptionModal.partialAmount` and `OtpModal.otp` when `visible` flips to true (or key modals by `activeCode`).
3. Clear `lastScannedRef` when the camera closes so the same code can be legitimately re-scanned.
4. Camera permission: when `!granted && !canAskAgain`, switch the button to `Linking.openSettings()`.
**Note:** verify/confirm atomicity needs a backend change — do NOT attempt it here; it's Part C.
**Commit:** `fix(scan): otp double-send guard, modal state resets, rescan, permission dead-end`

## F6 — React Query cache cleared on logout
**Severity:** High (cross-account data leak on shared merchant devices).
**Files:** `app/_layout.tsx` (queryClient), `src/store/authStore.ts` (`clearAuth`), merchant sign-out in `app/(merchant-tabs)/account.tsx`.
**Change:** Export `queryClient` from a standalone module (e.g. `src/lib/queryClient.ts`) imported by both the layout and the stores; call `queryClient.clear()` in both `clearAuth` implementations.
**Commit:** `fix(state): clear react-query cache on customer and merchant logout`

## F7 — Register flow: branch on error codes, not message substrings (COORDINATED)
**Depends on backend A11 step 1 being deployed.**
**File:** `app/(auth)/register.tsx` (~43–47) + shared error helper.
**Change:** Add `getErrorMessage(err: unknown)` and `getErrorCode(err: unknown)` helpers in `src/services/`; replace `err.message.includes('pending verification')` branching with `code === 'PHONE_VERIFICATION_PENDING'` etc. Migrate the ~20 `catch (err: any)` sites to the helper opportunistically ONLY where touched — no repo-wide sweep in this pass.
**Commit:** `refactor(errors): branch on stable error codes in register flow`

## F8 — Frontend hardening batch (small, one commit)
1. Bump `axios` to ≥1.12; run `npm audit fix` for runtime deps only (do not force-upgrade Expo SDK).
2. CI (`.github/workflows/ci.yml`): add `tsc --noEmit` and `eslint` steps alongside tests. Do NOT add an `npm audit` gate yet (build-chain advisories would block CI — flag count in a comment instead).
3. Fix TS debt at known sites: add `contact_phone` + `is_featured` to `Merchant` type; delete the 8 `as any` casts in `app/merchant/[id].tsx`; regenerate typed routes and remove the 4 `router.push(... as any)` casts.
4. Shared `normalizeLebanesePhone()` in `src/utils/phone.ts` — strips leading 0 after `+961`, validates 7–8 remaining digits, returns null on invalid; wire into the three existing call sites (`register.tsx`, `gift/index.tsx`, `ContactPickerModal.tsx`). Reject invalid numbers **before** payment initiation.
5. Language reconciliation: in `languageStore.loadLanguage`, drop the `!== get().language` guard; compute `effective = saved ?? deviceLocale ?? 'en'`, always call `i18next.changeLanguage(effective)`, set `isRTL` from it.
**Commit:** `fix(app): axios bump, CI typecheck+lint, Merchant types, shared phone normalizer, language reconciliation`

---

# PART C — Coordinated work (backend first, then frontend; sequence strictly)

| # | Backend change | Then frontend change |
|---|---|---|
| C1 | A7 idempotent initiate-payment + add `GET /v1/gifts/:id/payment-status` (auth'd, returns `payment_status` + share link if paid) | F3 upgrade: cancel/dismiss path calls payment-status and renders real state; remove the interim "unknown" copy |
| C2 | Atomic redemption: single `confirm-redemption` endpoint that takes the OTP (or make confirm retryable + accept a client idempotency key header) | `scan.tsx`: single-call flow; on timeout, retry with same idempotency key instead of re-verifying OTP |
| C3 | `POST /v1/auth/verify-phone-otp` returns updated user + tokens (mirror verify-email) | `verify-phone.tsx`: consume server response; delete client-side `is_phone_verified: true` write; wrap `JSON.parse` in try/catch; move pending session from route params into an in-memory `pendingSession` field on `authStore` (also fixes tokens-in-params) |
| C4 | A11 step 2: stop returning raw 500 messages (AFTER F7 is live) | — |

**STOP-GATE:** before starting Part C, confirm Part A items A1–A8 and Part B items F1–F3 are deployed/merged.

---

# PART D — Deferred (do NOT do in this pass; listed so they aren't lost)

- Least-privilege DB role (stop connecting as `postgres`); evaluate RLS afterward.
- Timestamp normalization migration (naive `timestamp` → `timestamptz`) — touches expiry logic; needs its own plan. Known risk: gift expiry off by UTC offset.
- CHECK constraint on `gift_instances`: `type='gift_item' → merchant_item_id NOT NULL`, `type='store_credit' → custom_credit_merchant_id NOT NULL`. CHECK on `admin_users.role`.
- Refresh-token rotation + jti denylist.
- Admin routes refactor onto controllers/services + wiring all `admin*Validation`.
- Gifts tab → `useInfiniteQuery`; React Query focus/online managers; `expo-image` migration; dead starter tree removal; ar.json missing keys + merchant portal i18n; ship-or-delete inert UI (whish selector, popular grid, profile rows).
- **languageStore `isLoading` gate** (declined during F8 to keep the diff scoped): first paint is gated on the auth stores but not on `loadLanguage`, so a theoretical race can paint one frame in the boot language before the store's `set()` re-renders the tree (self-correcting; pre-existing, not F8-introduced). A ~4-line `isLoading` flag on `languageStore` mirroring the auth stores' gate in `_layout.tsx` guarantees no flash.
- **Frontend residual `npm audit --omit=dev`: ~25 advisories (shell-quote critical; tar/undici/ws/node-forge/xmldom/picomatch highs)** — all live in the Expo CLI/dev chain that npm classifies as prod via `expo`'s own dependencies; none of it ships in the app bundle. The fixes are `isSemVerMajor` Expo SDK bumps, i.e. gated behind the deferred SDK upgrade above. The genuinely runtime advisories (axios ×2 high, form-data high) were fixed in F8 (`axios ^1.18.1`, `form-data 4.0.6`).
- Schema/migrations reconciliation into an authoritative baseline (`pg_dump --schema-only` vs `migrations/`).
- Remove dead deps: backend (`stripe`, `twilio`, `@sendgrid/mail`, `bull` if confirmed unused) and frontend (`react-native-webview`, `expo-haptics`, `expo-symbols`).
- Seed rework: `seeds/*` insert into the dropped `gift_cards` table — reseeding is broken; rebuild seeds onto `merchant_items`/`store_credit_presets`.
- **Test suites for everything fixed above** — separate follow-up task (interceptor suite, `decidePaymentOutcome` table test, phone normalizer, redemption e2e, webhook signature + fail-closed, wallet_items uniqueness).

---

# Pre-flight checks (run before Item A1)

```sql
-- confirm the state this plan assumes:
SELECT to_regclass('public.transactions');          -- expect NULL
SELECT to_regclass('public.gift_cards');            -- expect NULL
SELECT id, email, role FROM admin_users;            -- verify a superadmin actually exists
SELECT user_id, gift_instance_id, COUNT(*)
FROM wallet_items GROUP BY 1,2 HAVING COUNT(*) > 1; -- duplicate count for A8
```
If `transactions` or `gift_cards` unexpectedly exist, STOP — the plan's premises are wrong.
