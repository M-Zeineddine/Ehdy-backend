# Secrets Rotation Checklist

Every credential below was present in the working-tree `.env` during the audit and must be
considered **exposed**. Rotate each at its provider, then update the deployment environment (not the
repo). This is an ops task — secrets are never rotated in code.

Boot-time validation (`src/config/validateEnv.js`) refuses to start in production if `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `TAP_SECRET_KEY`, `DATABASE_URL`/`DB_PASSWORD` are missing/placeholder/weak, or
if `CORS_ORIGIN` contains `*`.

## Rotate

- [ ] **Postgres superuser password** (`DB_PASSWORD`, also embedded in `DATABASE_URL`) — rotate in
      Supabase dashboard; update `DATABASE_URL`. (Follow-up: move off the `postgres` superuser to a
      least-privilege application role — deferred item.)
- [ ] **`JWT_SECRET`** — generate a long random value (≥32 chars, e.g. `openssl rand -base64 48`).
      Rotating invalidates all existing user/merchant/admin tokens (acceptable). Prefer distinct
      secrets per audience as a follow-up.
- [ ] **`JWT_REFRESH_SECRET`** — separate long random value; invalidates outstanding refresh tokens.
- [ ] **`TAP_SECRET_KEY`** — rotate in the Tap dashboard; required for webhook signature verification
      (now fails closed).
- [ ] **`RESEND_API_KEY`** — rotate in Resend.
- [ ] **`VERIFYWAY_API_KEY`** — rotate in VerifyWay.
- [ ] **SMTP password** (`SMTP_PASS` / equivalent) — rotate at the mail provider.

## After rotating

- [ ] Update the deployment environment / secret store with the new values.
- [ ] Confirm the app boots (env validation passes) and a smoke test of auth + a test payment works.
- [ ] Confirm the old `.env` in any working tree is not committed and scrub it from developer machines.
