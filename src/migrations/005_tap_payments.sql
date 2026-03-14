-- Kado Platform — Migration 005
-- Purpose: Replace Stripe with Tap Payments on gifts_sent
-- Date: March 2026
-- ============================================================================

-- Add payment tracking columns to gifts_sent
ALTER TABLE public.gifts_sent
  ADD COLUMN IF NOT EXISTS tap_charge_id   VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_status  VARCHAR(20)  NOT NULL DEFAULT 'pending';

-- Index for webhook lookups (tap_charge_id)
CREATE INDEX IF NOT EXISTS idx_gifts_sent_tap_charge_id  ON public.gifts_sent(tap_charge_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_payment_status ON public.gifts_sent(payment_status);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- 1. Added tap_charge_id VARCHAR(255) UNIQUE to gifts_sent
--    → Stores the Tap charge ID returned when payment is initiated
-- 2. Added payment_status VARCHAR(20) DEFAULT 'pending' to gifts_sent
--    → Values: pending | paid | failed
-- 3. Two indexes for fast webhook + status lookups
-- ============================================================================
