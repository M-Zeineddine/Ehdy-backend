-- Kado Platform — Migration 008
-- Purpose: Remove location columns from merchants — merchant_branches is now the source of truth
-- Date: March 2026
-- Prerequisites: Migration 007 must be run first. Migrate any existing location data
--   into merchant_branches before running this migration.

ALTER TABLE public.merchants
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS city;
