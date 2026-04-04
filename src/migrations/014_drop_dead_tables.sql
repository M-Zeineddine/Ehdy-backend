-- Migration 014: Drop dead tables (Stripe-era artifacts)
-- purchases, transactions, merchant_visits are all unused in the Tap payment flow

-- Drop FK references first
ALTER TABLE gift_instances DROP COLUMN IF EXISTS purchase_id;

-- Drop tables
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS merchant_visits CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
