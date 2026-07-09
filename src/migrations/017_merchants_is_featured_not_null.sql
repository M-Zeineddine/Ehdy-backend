-- Migration 017: enforce NOT NULL on merchants.is_featured
--
-- Repo migration 009 declared `is_featured BOOLEAN NOT NULL DEFAULT FALSE`, but
-- the hand-applied 009 on production lost the NOT NULL — the schema diff on
-- 2026-07-09 (repo migrations vs pg_dump of prod) found prod's column nullable
-- while a fresh migrate:up produces NOT NULL. This reconciles prod to the repo
-- WITHOUT another out-of-band edit: it ships as a tracked migration.
--
-- Safe on a fresh DB (009 already made it NOT NULL): the UPDATE touches 0 rows
-- and SET NOT NULL is a no-op. Prod null count at authoring time: 0.
-- This is the first migration the runner applies to production after baselining.

UPDATE merchants SET is_featured = false WHERE is_featured IS NULL;

ALTER TABLE merchants ALTER COLUMN is_featured SET NOT NULL;
