-- Kado Platform — Migration 021
-- Purpose: Drop merchant_users.branch_id. Branch scope now lives exclusively
-- in merchant_user_branches (migration 020). Any remaining branch_id values
-- are backfilled first so no scope is lost.
-- IMPORTANT: deploy code that no longer reads mu.branch_id BEFORE running this.
-- Date: July 2026

INSERT INTO public.merchant_user_branches (merchant_user_id, branch_id)
SELECT id, branch_id FROM public.merchant_users
WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.merchant_users DROP COLUMN IF EXISTS branch_id;
