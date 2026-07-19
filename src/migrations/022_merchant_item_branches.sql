-- Kado Platform — Migration 022
-- Purpose: Branch-scoped item availability. An item with no rows here is
-- available at all branches (the default, matching all existing items);
-- one or more rows restrict redemption to those branches.
-- Date: July 2026

CREATE TABLE IF NOT EXISTS public.merchant_item_branches (
  merchant_item_id UUID NOT NULL REFERENCES public.merchant_items(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES public.merchant_branches(id) ON DELETE CASCADE,
  created_at       TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (merchant_item_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_item_branches_branch
  ON public.merchant_item_branches(branch_id);
