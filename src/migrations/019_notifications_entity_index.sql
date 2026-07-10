-- Migration 019: index notifications for the expiry-notification dedupe.
--
-- checkExpiringGifts now runs a NOT EXISTS against
--   (related_entity_type, related_entity_id, type)
-- for every candidate gift on every daily run. Verified against a pg_dump of
-- production: notifications carries only idx_notifications_user and
-- idx_notifications_unread, so those columns are unindexed today.
--
-- First non-cleanup migration applied through the runner on the baselined ledger.

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications (related_entity_type, related_entity_id, type);
