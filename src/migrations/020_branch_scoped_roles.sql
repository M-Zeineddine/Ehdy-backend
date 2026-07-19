-- Kado Platform — Migration 020
-- Purpose: Branch-scoped portal roles.
--   1. Add 'manager' (branch admin) to the merchant_users role set.
--   2. Add merchant_user_branches so a manager can be scoped to one or more
--      branches. Convention: no rows = access to all branches (matches the
--      existing NULL branch_id convention); one or more rows = only those.
-- Date: July 2026

ALTER TABLE public.merchant_users
  DROP CONSTRAINT IF EXISTS merchant_users_role_check;

ALTER TABLE public.merchant_users
  ADD CONSTRAINT merchant_users_role_check
  CHECK (role IN ('owner', 'manager', 'staff'));

CREATE TABLE IF NOT EXISTS public.merchant_user_branches (
  merchant_user_id UUID NOT NULL REFERENCES public.merchant_users(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES public.merchant_branches(id) ON DELETE CASCADE,
  created_at       TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (merchant_user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_user_branches_branch
  ON public.merchant_user_branches(branch_id);

-- Backfill: users already pinned to a single branch via branch_id keep the
-- same scope under the new table.
INSERT INTO public.merchant_user_branches (merchant_user_id, branch_id)
SELECT id, branch_id FROM public.merchant_users
WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;
