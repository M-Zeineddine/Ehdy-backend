-- Kado Platform — Migration 011
-- Purpose: Support custom (non-preset) store credit amounts in gift flows
-- Date: March 2026
-- ============================================================================
-- Background: store_credit_presets are merchant-defined suggestions displayed
-- as quick-select chips. Users can also type any amount freely. This migration
-- adds first-class columns so custom amounts are stored alongside preset gifts
-- without needing a preset row.
-- ============================================================================


-- ============================================================================
-- STEP 1: Add custom credit columns to gift_drafts
-- ============================================================================

ALTER TABLE public.gift_drafts
  ADD COLUMN custom_credit_amount      NUMERIC(10,2),
  ADD COLUMN custom_credit_currency    TEXT,
  ADD COLUMN custom_credit_merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;


-- ============================================================================
-- STEP 2: Add custom credit columns to gifts_sent
-- ============================================================================

ALTER TABLE public.gifts_sent
  ADD COLUMN custom_credit_amount      NUMERIC(10,2),
  ADD COLUMN custom_credit_currency    TEXT,
  ADD COLUMN custom_credit_merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;


-- ============================================================================
-- STEP 3: Add custom_credit_merchant_id to gift_instances
-- (amount + currency already stored in initial_balance + currency_code)
-- ============================================================================

ALTER TABLE public.gift_instances
  ADD COLUMN custom_credit_merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;


-- ============================================================================
-- STEP 4: Update gift_drafts constraint — allow custom credit case
-- ============================================================================

ALTER TABLE public.gift_drafts DROP CONSTRAINT check_gift_drafts_gift_type;

ALTER TABLE public.gift_drafts
  ADD CONSTRAINT check_gift_drafts_gift_type CHECK (
    -- Bundle gift
    (bundle_id IS NOT NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NULL) OR
    -- Specific gift item
    (bundle_id IS NULL AND merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NULL) OR
    -- Preset store credit
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NOT NULL AND custom_credit_amount IS NULL) OR
    -- Custom store credit amount
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NOT NULL)
  );


-- ============================================================================
-- STEP 5: Update gifts_sent constraint — allow custom credit case
-- ============================================================================

ALTER TABLE public.gifts_sent DROP CONSTRAINT check_gifts_sent_gift_type;

ALTER TABLE public.gifts_sent
  ADD CONSTRAINT check_gifts_sent_gift_type CHECK (
    -- Bundle gift
    (bundle_id IS NOT NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NULL) OR
    -- Specific gift item
    (bundle_id IS NULL AND merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NULL) OR
    -- Preset store credit
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NOT NULL AND custom_credit_amount IS NULL) OR
    -- Custom store credit amount
    (bundle_id IS NULL AND merchant_item_id IS NULL AND store_credit_preset_id IS NULL AND custom_credit_amount IS NOT NULL)
  );


-- ============================================================================
-- STEP 6: Update gift_instances constraint — allow custom credit case
-- ============================================================================

ALTER TABLE public.gift_instances DROP CONSTRAINT check_gift_instances_item_xor_credit;

ALTER TABLE public.gift_instances
  ADD CONSTRAINT check_gift_instances_item_xor_credit CHECK (
    -- Specific gift item
    (merchant_item_id IS NOT NULL AND store_credit_preset_id IS NULL AND custom_credit_merchant_id IS NULL) OR
    -- Preset store credit
    (merchant_item_id IS NULL AND store_credit_preset_id IS NOT NULL AND custom_credit_merchant_id IS NULL) OR
    -- Custom store credit amount (merchant tracked via custom_credit_merchant_id)
    (merchant_item_id IS NULL AND store_credit_preset_id IS NULL AND custom_credit_merchant_id IS NOT NULL)
  );


-- ============================================================================
-- STEP 7: Add index for custom credit merchant lookups on gifts_sent
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gifts_sent_custom_credit_merchant
  ON public.gifts_sent(custom_credit_merchant_id)
  WHERE custom_credit_merchant_id IS NOT NULL;


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 1. Added custom_credit_amount, custom_credit_currency, custom_credit_merchant_id
--    to gift_drafts and gifts_sent
-- 2. Added custom_credit_merchant_id to gift_instances
--    (amount stored in existing initial_balance + currency_code columns)
-- 3. Updated all three gift-type check constraints to allow the custom credit case
-- 4. Added sparse index on gifts_sent for custom credit merchant queries
-- ============================================================================
