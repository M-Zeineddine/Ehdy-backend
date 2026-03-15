-- Kado Platform — Migration 007
-- Purpose: Add merchant_branches table for per-branch location, hours, and staff assignment
-- Date: March 2026

CREATE TABLE public.merchant_branches (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL,
  name          character varying NOT NULL,
  address       text,
  city          character varying,
  latitude      numeric,
  longitude     numeric,
  contact_phone character varying,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp without time zone DEFAULT now(),
  updated_at    timestamp without time zone DEFAULT now(),
  CONSTRAINT merchant_branches_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_branches_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_merchant_branches_merchant_id ON public.merchant_branches(merchant_id);
CREATE INDEX idx_merchant_branches_location    ON public.merchant_branches(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add role column to merchant_users to distinguish owners from cashier staff
ALTER TABLE public.merchant_users
  ADD COLUMN IF NOT EXISTS role character varying NOT NULL DEFAULT 'staff'
  CHECK (role IN ('owner', 'staff'));

-- Optional: link a staff member to a specific branch (NULL = access to all branches)
ALTER TABLE public.merchant_users
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.merchant_branches(id) ON DELETE SET NULL;
