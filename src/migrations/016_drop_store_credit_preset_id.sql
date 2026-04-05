-- store_credit_preset_id in gifts_sent, gift_instances, and gift_drafts was dead weight.
-- Presets are merchant UX config only. All credit gifts now store
-- merchant + amount + currency directly, making preset vs custom identical in storage.

ALTER TABLE gifts_sent      DROP COLUMN IF EXISTS store_credit_preset_id;
ALTER TABLE gift_instances  DROP COLUMN IF EXISTS store_credit_preset_id;
ALTER TABLE gift_drafts     DROP COLUMN IF EXISTS store_credit_preset_id;
