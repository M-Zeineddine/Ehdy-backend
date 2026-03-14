-- Kado Platform — Migration 006
-- Purpose: Add gift_sent_id to gift_instances for direct linking
-- Date: March 2026

ALTER TABLE public.gift_instances
  ADD COLUMN IF NOT EXISTS gift_sent_id UUID REFERENCES public.gifts_sent(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gift_instances_gift_sent_id ON public.gift_instances(gift_sent_id);
