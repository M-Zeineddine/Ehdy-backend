-- Migration: add is_featured to merchants
-- Run this in Supabase SQL Editor

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

-- Mark hand-picked featured merchants
UPDATE merchants SET is_featured = TRUE
WHERE slug IN ('patchi', 'roadster-diner', 'starbucks-lb', 'nails-and-more');
