-- ============================================================================
-- ONE-TIME — PRODUCTION ONLY — baseline the _migrations ledger.
-- NEVER place this file in src/migrations/.
--
-- Why not a migration: it sorts before 001, so on a FRESH database migrate:up
-- would run it first, record 001-016 as "applied", and then skip them —
-- leaving an empty schema with a ledger that lies. It is only ever correct to
-- run this against the EXISTING production DB, whose schema already reflects
-- 001-016 (all applied by hand; the ledger is empty).
--
-- Run once, by hand, against production (SQL editor). After it, the ledger
-- matches reality and `migrate:up` becomes safe: it will skip 001-016 and run
-- only new files (017, 018, ...). This is the LAST hand-applied DDL — every
-- migration after it goes through migrate:up.
--
-- Precondition: run scripts/... schema diff first (A15) and confirm the repo
-- migrations reproduce prod. Do not baseline over an unverified divergence.
-- ============================================================================

INSERT INTO _migrations (filename) VALUES
  ('001_initial_schema.sql'),
  ('002_split_gift_cards.sql'),
  ('003_migrate_gift_card_fks.sql'),
  ('004_simplify_gift_delivery.sql'),
  ('005_tap_payments.sql'),
  ('006_gift_instances_gift_sent_id.sql'),
  ('007_merchant_branches.sql'),
  ('008_remove_merchant_location_columns.sql'),
  ('009_admin_cms.sql'),
  ('009_admin_users.sql'),
  ('010_merchant_visits.sql'),
  ('011_custom_credit_amount.sql'),
  ('012_redemption_events.sql'),
  ('013_schema_cleanup.sql'),
  ('014_drop_dead_tables.sql'),
  ('015_audit_tables.sql'),
  ('016_drop_store_credit_preset_id.sql')
ON CONFLICT (filename) DO NOTHING;
