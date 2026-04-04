-- Migration 013: Schema cleanup
-- Fixes: timestamps, dead columns, type column, constraints, delivery_channel, redemption_events

-- ─── 1. Fix timestamp timezones ───────────────────────────────────────────────
-- Standardise everything to TIMESTAMPTZ (with time zone)

ALTER TABLE merchant_items
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE store_credit_presets
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- ─── 2. Add delivery_channel back to gifts_sent ───────────────────────────────
-- It was present in the original schema but dropped during migrations.
-- Values: 'email', 'sms', 'whatsapp'
ALTER TABLE gifts_sent
  ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(20)
    CHECK (delivery_channel IN ('email', 'sms', 'whatsapp'));

-- ─── 3. Drop dead columns from gifts_sent ─────────────────────────────────────
-- is_claimed / claimed_at / claimed_by_user_id: never set, claim flow deferred
-- expiration_date: lives on gift_instances (that's where redemption checks it)
-- scheduled_for: never used in Tap flow
ALTER TABLE gifts_sent
  DROP COLUMN IF EXISTS is_claimed,
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS claimed_by_user_id,
  DROP COLUMN IF EXISTS expiration_date,
  DROP COLUMN IF EXISTS scheduled_for;

-- ─── 4. Drop dead column from wallet_items ────────────────────────────────────
-- custom_message is always a copy of gifts_sent.personal_message — join instead
ALTER TABLE wallet_items
  DROP COLUMN IF EXISTS custom_message;

-- ─── 5. Drop dead columns from gift_drafts ────────────────────────────────────
-- recipient_name_field: duplicate of recipient_name
-- stripe_payment_intent_id: Stripe is gone
ALTER TABLE gift_drafts
  DROP COLUMN IF EXISTS recipient_name_field,
  DROP COLUMN IF EXISTS stripe_payment_intent_id;

-- ─── 6. Add explicit type column to gift_instances ────────────────────────────
-- Avoids fragile CASE WHEN merchant_item_id IS NOT NULL inference at query time
ALTER TABLE gift_instances
  ADD COLUMN IF NOT EXISTS type VARCHAR(20)
    CHECK (type IN ('gift_item', 'store_credit'));

-- Backfill from existing data
UPDATE gift_instances
SET type = CASE
  WHEN merchant_item_id IS NOT NULL THEN 'gift_item'
  ELSE 'store_credit'
END
WHERE type IS NULL;

-- Now make it NOT NULL
ALTER TABLE gift_instances
  ALTER COLUMN type SET NOT NULL;

-- ─── 7. Mutual exclusion on gift_instances gift type fields ───────────────────
-- Prevent merchant_item_id and store_credit fields being set simultaneously
ALTER TABLE gift_instances
  ADD CONSTRAINT gift_instance_type_exclusivity CHECK (
    (merchant_item_id IS NOT NULL)::int +
    (store_credit_preset_id IS NOT NULL)::int +
    (custom_credit_merchant_id IS NOT NULL)::int <= 1
  );

-- ─── 8. Mutual exclusion on gifts_sent gift type fields ───────────────────────
ALTER TABLE gifts_sent
  ADD CONSTRAINT gifts_sent_type_exclusivity CHECK (
    (merchant_item_id IS NOT NULL)::int +
    (store_credit_preset_id IS NOT NULL)::int +
    (custom_credit_merchant_id IS NOT NULL)::int <= 1
  );

-- ─── 9. Add CHECK constraint to gifts_sent.payment_status ────────────────────
-- gifts_sent uses 'pending','paid','failed' — different from the Stripe-era
-- payment_status enum. Keep it VARCHAR but enforce valid values via CHECK.
ALTER TABLE gifts_sent
  ADD CONSTRAINT gifts_sent_payment_status_check
    CHECK (payment_status IN ('pending', 'paid', 'failed'));

-- ─── 10. bundle_items unique constraint ──────────────────────────────────────
-- Prevent the same merchant_item being added twice to one bundle
ALTER TABLE bundle_items
  DROP CONSTRAINT IF EXISTS bundle_items_bundle_id_merchant_item_id_key;

ALTER TABLE bundle_items
  ADD CONSTRAINT bundle_items_unique UNIQUE (bundle_id, merchant_item_id);

-- ─── 11. Add merchant_user_id and branch_id to redemption_events ──────────────
-- Track exactly which staff member at which branch performed each redemption
ALTER TABLE redemption_events
  ADD COLUMN IF NOT EXISTS merchant_user_id UUID REFERENCES merchant_users(id),
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id);

CREATE INDEX IF NOT EXISTS idx_redemption_events_merchant_user ON redemption_events(merchant_user_id);
