-- Migration 025: enforce uniqueness on users.phone
--
-- Phone is becoming a login credential (phone OTP sign-in), so the existing
-- app-level check-then-insert in authService.signup() (a race condition) is
-- no longer enough. users.phone previously had only a plain index
-- (idx_users_phone), unlike email which is UNIQUE NOT NULL.
--
-- Step 1 clears any pre-existing duplicate phones (keeping the oldest row)
-- so the constraint below can be added safely. NULLs are unaffected — a
-- UNIQUE constraint allows any number of NULLs in Postgres.

WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn
  FROM users
  WHERE phone IS NOT NULL
)
UPDATE users SET phone = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
