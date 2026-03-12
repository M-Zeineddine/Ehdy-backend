-- Migration 002: Split gift_cards into merchant_items and store_credit_presets
-- Run this in Supabase SQL Editor

-- 1. Create merchant_items table
CREATE TABLE merchant_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name          VARCHAR(255)  NOT NULL,
  description   TEXT,
  image_url     TEXT,
  price         NUMERIC(10,2),
  currency_code VARCHAR(10)   NOT NULL DEFAULT 'USD',
  item_sku      VARCHAR(100),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. Create store_credit_presets table
CREATE TABLE store_credit_presets (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  currency_code VARCHAR(10)   NOT NULL DEFAULT 'USD',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 3. Migrate gift items
INSERT INTO merchant_items (id, merchant_id, name, description, image_url, price, currency_code, item_sku, is_active, created_at)
SELECT
  id,
  merchant_id,
  name,
  description,
  COALESCE(item_image_url, image_url),
  item_price,
  currency_code,
  item_sku,
  is_active,
  created_at
FROM gift_cards
WHERE type = 'gift_item';

-- 4. Migrate store credit presets
INSERT INTO store_credit_presets (id, merchant_id, amount, currency_code, is_active, created_at)
SELECT
  id,
  merchant_id,
  credit_amount,
  currency_code,
  is_active,
  created_at
FROM gift_cards
WHERE type = 'store_credit' AND credit_amount IS NOT NULL;

-- NOTE: gift_cards is intentionally kept — gift_instances, bundle_items, gifts_sent,
-- and gift_drafts all reference it. It will serve as the actual sent-gift entity.
-- Catalog data above has been migrated to merchant_items and store_credit_presets.
