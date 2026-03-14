-- Kado Platform — Migration 004 (FINAL - FUTURE-PROOF)
-- Purpose: Simplify gift delivery model, fix schema integrity, optimize performance
-- Date: March 2026
-- ============================================================================
-- WARNING: Review all statements before running in production!
-- ============================================================================


-- ============================================================================
-- STEP 1: Remove delivery_channel
-- User shares the gift link however they want (WhatsApp, copy, email, etc.)
-- ============================================================================

ALTER TABLE public.gifts_sent
  DROP COLUMN IF EXISTS delivery_channel;

ALTER TABLE public.gift_drafts
  DROP COLUMN IF EXISTS delivery_channel;


-- ============================================================================
-- STEP 2: Drop scheduled_for (post-MVP — removed from UI)
-- ============================================================================

ALTER TABLE public.gifts_sent
  DROP COLUMN IF EXISTS scheduled_for;

ALTER TABLE public.gift_drafts
  DROP COLUMN IF EXISTS scheduled_for;


-- ============================================================================
-- STEP 3: Extend gift_theme enum to match app theme IDs
-- Old values (thank_you, thinking_of_you, etc.) kept for backward compat.
-- App-side IDs: thankyou, thinking, congrats, sorry
-- ============================================================================

ALTER TYPE gift_theme ADD VALUE IF NOT EXISTS 'thankyou';
ALTER TYPE gift_theme ADD VALUE IF NOT EXISTS 'thinking';
ALTER TYPE gift_theme ADD VALUE IF NOT EXISTS 'congrats';
ALTER TYPE gift_theme ADD VALUE IF NOT EXISTS 'sorry';


-- ============================================================================
-- STEP 4: Add missing FK on wallet_items.gift_sent_id
-- Column existed but had no foreign key constraint
-- ============================================================================

ALTER TABLE public.wallet_items
  ADD CONSTRAINT wallet_items_gift_sent_id_fkey
  FOREIGN KEY (gift_sent_id) REFERENCES public.gifts_sent(id)
  ON DELETE CASCADE;



-- ============================================================================
-- STEP 6: Data integrity constraints (ALL SAFE)
-- ============================================================================

-- gift_instances: must reference exactly one of merchant_item OR store_credit (never both, never neither)
ALTER TABLE public.gift_instances
  ADD CONSTRAINT check_gift_instances_item_xor_credit CHECK (
    (merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL) OR
    (merchant_item_id IS NULL  AND store_credit_preset_id IS NOT NULL)
  );

-- gifts_sent: must be exactly one of — bundle, merchant_item, or store_credit
-- FUTURE-PROOF: This constraint enforces the rule now, before bundle feature is built
-- Safe because: No existing bundle data, code controls all inserts, prevents bugs
ALTER TABLE public.gifts_sent
  ADD CONSTRAINT check_gifts_sent_gift_type CHECK (
    (bundle_id IS NOT NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL) OR
    (bundle_id IS NULL AND merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL) OR
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NOT NULL)
  );

-- gift_drafts: same 3-way logic
ALTER TABLE public.gift_drafts
  ADD CONSTRAINT check_gift_drafts_gift_type CHECK (
    (bundle_id IS NOT NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL) OR
    (bundle_id IS NULL AND merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL) OR
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NOT NULL)
  );


-- ============================================================================
-- STEP 7: Performance indexes (IF NOT EXISTS — safe to re-run)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gift_instances_redemption_code      ON public.gift_instances(redemption_code);
CREATE INDEX IF NOT EXISTS idx_wallet_items_user_id                ON public.wallet_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_items_received_at            ON public.wallet_items(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_sender_user_id           ON public.gifts_sent(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_recipient_user_id        ON public.gifts_sent(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_share_link               ON public.gifts_sent(unique_share_link);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_is_claimed               ON public.gifts_sent(is_claimed);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_created_at               ON public.gifts_sent(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_items_merchant_id          ON public.merchant_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_presets_merchant_id    ON public.store_credit_presets(merchant_id);


-- ============================================================================
-- STEP 8: Schema comments
-- ============================================================================

COMMENT ON COLUMN public.gift_instances.merchant_item_id IS
  'Specific gift item. Mutually exclusive with store_credit_preset_id.';
COMMENT ON COLUMN public.gift_instances.store_credit_preset_id IS
  'Store credit preset. Mutually exclusive with merchant_item_id.';
COMMENT ON COLUMN public.gift_instances.current_balance IS
  'Store credit: remaining balance. Gift item: NULL (not applicable).';
COMMENT ON COLUMN public.gift_instances.item_claimed IS
  'Gift item: whether claimed. Store credit: NULL (not applicable).';
COMMENT ON COLUMN public.gifts_sent.unique_share_link IS
  'Recipient uses this link to claim their gift. Shareable via any channel.';
COMMENT ON TABLE public.gift_drafts IS
  'In-progress gift customization. Deleted after purchase completes or expires.';
COMMENT ON TABLE public.merchant_users IS
  'Merchant dashboard logins — separate from regular customer users.';


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 1. Dropped delivery_channel from gifts_sent + gift_drafts
--    → User shares the link however they want
-- 2. Dropped scheduled_for from gifts_sent + gift_drafts
--    → Post-MVP feature, removed from UI
-- 3. Added gift_theme enum values: thankyou, thinking, congrats, sorry
--    → Aligns DB with app theme IDs (old values kept for compat)
-- 4. Added FK wallet_items.gift_sent_id → gifts_sent.id (was missing)
-- 5. Added data integrity constraints (gift_instances + gifts_sent + gift_drafts)
--    → Future-proof for bundle feature
-- 6. Added 10 performance indexes (all IF NOT EXISTS, safe to re-run)
-- 7. Added schema comments for future developers
-- ============================================================================
-- MIGRATION STATUS: ✅ SAFE & FUTURE-PROOF - Bundle constraints enforced from day 1
-- ============================================================================
