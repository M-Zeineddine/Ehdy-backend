-- Kado Platform - Migration 009
-- Purpose: Add owner/admin access for the CMS and ensure merchant feature flags exist
-- Date: March 2026

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'owner',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_email_check CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Seed super-admin ─────────────────────────────────────────────────────────
-- Generate a real bcrypt hash by running this in Kado-backend:
--   node -e "require('bcryptjs').hash('YourPassword', 10).then(h => console.log(h))"
-- Then replace the hash below and run this INSERT:
--
-- INSERT INTO admin_users (email, password_hash, first_name, last_name, role)
-- VALUES ('admin@kado.app', '<YOUR_BCRYPT_HASH>', 'Super', 'Admin', 'superadmin')
-- ON CONFLICT (email) DO NOTHING;
