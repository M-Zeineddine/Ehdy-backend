-- Migration 003: Replace gift_card_id FKs with merchant_item_id / store_credit_preset_id
-- Run this in Supabase SQL Editor AFTER migration 002

-- ── Step 1: Add new FK columns ────────────────────────────────────────────────

ALTER TABLE gift_instances
  ADD COLUMN merchant_item_id       UUID REFERENCES merchant_items(id),
  ADD COLUMN store_credit_preset_id UUID REFERENCES store_credit_presets(id);

ALTER TABLE gifts_sent
  ADD COLUMN merchant_item_id       UUID REFERENCES merchant_items(id),
  ADD COLUMN store_credit_preset_id UUID REFERENCES store_credit_presets(id);

ALTER TABLE gift_drafts
  ADD COLUMN merchant_item_id       UUID REFERENCES merchant_items(id),
  ADD COLUMN store_credit_preset_id UUID REFERENCES store_credit_presets(id);

ALTER TABLE bundle_items
  ADD COLUMN merchant_item_id UUID REFERENCES merchant_items(id);

-- ── Step 2: Backfill from preserved IDs ──────────────────────────────────────
-- IDs were kept identical during migration 002, so we can match directly.

UPDATE gift_instances gi
SET merchant_item_id = gc.id
FROM gift_cards gc
WHERE gi.gift_card_id = gc.id AND gc.type = 'gift_item';

UPDATE gift_instances gi
SET store_credit_preset_id = gc.id
FROM gift_cards gc
WHERE gi.gift_card_id = gc.id AND gc.type = 'store_credit';

UPDATE gifts_sent gs
SET merchant_item_id = gc.id
FROM gift_cards gc
WHERE gs.gift_card_id = gc.id AND gc.type = 'gift_item';

UPDATE gifts_sent gs
SET store_credit_preset_id = gc.id
FROM gift_cards gc
WHERE gs.gift_card_id = gc.id AND gc.type = 'store_credit';

UPDATE gift_drafts gd
SET merchant_item_id = gc.id
FROM gift_cards gc
WHERE gd.gift_card_id = gc.id AND gc.type = 'gift_item';

UPDATE gift_drafts gd
SET store_credit_preset_id = gc.id
FROM gift_cards gc
WHERE gd.gift_card_id = gc.id AND gc.type = 'store_credit';

UPDATE bundle_items bi
SET merchant_item_id = gc.id
FROM gift_cards gc
WHERE bi.gift_card_id = gc.id;

-- Now that bundle_items is backfilled, enforce NOT NULL
ALTER TABLE bundle_items ALTER COLUMN merchant_item_id SET NOT NULL;

-- ── Step 3: Drop old FK columns ───────────────────────────────────────────────

ALTER TABLE gift_instances DROP COLUMN gift_card_id;
ALTER TABLE gifts_sent     DROP COLUMN gift_card_id;
ALTER TABLE gift_drafts    DROP COLUMN gift_card_id;
ALTER TABLE bundle_items   DROP COLUMN gift_card_id;

-- ── Step 4: Drop gift_cards ───────────────────────────────────────────────────

DROP TABLE gift_cards;

-- ── Step 5: Drop now-unused indexes ──────────────────────────────────────────

DROP INDEX IF EXISTS idx_gift_cards_merchant;
DROP INDEX IF EXISTS idx_gift_cards_active;
