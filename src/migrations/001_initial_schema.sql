-- Kado Platform - Initial Database Schema
-- PostgreSQL 14+

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE gift_type AS ENUM ('store_credit', 'gift_item');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gift_theme AS ENUM ('birthday','thank_you','love','thinking_of_you','just_because','congratulations');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_channel AS ENUM ('email', 'sms', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  profile_picture_url VARCHAR(500),
  country_code VARCHAR(2) DEFAULT 'LB',
  currency_code VARCHAR(3) DEFAULT 'LBP',
  date_of_birth DATE,
  language VARCHAR(10) DEFAULT 'en',
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_phone_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  phone_verified_at TIMESTAMP,
  auth_provider VARCHAR(50),
  auth_provider_id VARCHAR(255),
  stripe_customer_id VARCHAR(255) UNIQUE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT valid_phone CHECK (phone IS NULL OR phone ~* '^\+?[0-9]{7,15}$')
);

-- categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- merchants
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  website_url VARCHAR(500),
  logo_url VARCHAR(500),
  banner_image_url VARCHAR(500),
  category_id UUID NOT NULL REFERENCES categories(id),
  country_code VARCHAR(2) DEFAULT 'LB',
  city VARCHAR(100),
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  stripe_account_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  rating DECIMAL(2, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5)
);

-- merchant_users (for merchant portal login)
CREATE TABLE IF NOT EXISTS merchant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- gift_cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type gift_type NOT NULL,
  is_store_credit BOOLEAN DEFAULT FALSE,
  credit_amount DECIMAL(10, 2),
  item_name VARCHAR(255),
  item_sku VARCHAR(255),
  item_price DECIMAL(10, 2),
  item_image_url VARCHAR(500),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'LBP',
  image_url VARCHAR(500),
  stripe_product_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  valid_from_days INTEGER DEFAULT 0,
  valid_until_days INTEGER DEFAULT 365,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT amount_positive CHECK (credit_amount IS NULL OR credit_amount > 0),
  CONSTRAINT item_price_positive CHECK (item_price IS NULL OR item_price > 0)
);

-- purchases
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  items JSONB NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'LBP',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  failure_reason TEXT,
  metadata JSONB,
  purchased_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- gift_instances
CREATE TABLE IF NOT EXISTS gift_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES purchases(id),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id),
  redemption_code VARCHAR(255) UNIQUE NOT NULL,
  redemption_qr_code TEXT,
  current_balance DECIMAL(10, 2),
  initial_balance DECIMAL(10, 2),
  item_claimed BOOLEAN DEFAULT FALSE,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'LBP',
  is_redeemed BOOLEAN DEFAULT FALSE,
  redeemed_at TIMESTAMP,
  redeemed_amount DECIMAL(10, 2),
  redeemed_by_merchant_id UUID REFERENCES merchants(id),
  qr_scanned_at TIMESTAMP,
  redemption_method VARCHAR(50) DEFAULT 'qr_code',
  expiration_date DATE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT balance_non_negative CHECK (current_balance IS NULL OR current_balance >= 0)
);

-- wallet_items
CREATE TABLE IF NOT EXISTS wallet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  gift_instance_id UUID NOT NULL REFERENCES gift_instances(id),
  sender_user_id UUID REFERENCES users(id),
  gift_sent_id UUID,
  custom_message TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMP DEFAULT NOW(),
  viewed_at TIMESTAMP,
  UNIQUE(user_id, gift_instance_id)
);

-- bundles
CREATE TABLE IF NOT EXISTS bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  theme gift_theme,
  total_value DECIMAL(12, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'LBP',
  is_template BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- bundle_items
CREATE TABLE IF NOT EXISTS bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(bundle_id, gift_card_id),
  CONSTRAINT quantity_positive CHECK (quantity > 0)
);

-- gifts_sent
CREATE TABLE IF NOT EXISTS gifts_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES users(id),
  bundle_id UUID REFERENCES bundles(id),
  gift_card_id UUID REFERENCES gift_cards(id),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(20),
  recipient_name VARCHAR(100),
  theme gift_theme,
  sender_name VARCHAR(100),
  personal_message TEXT,
  delivery_channel delivery_channel NOT NULL,
  unique_share_link VARCHAR(255) UNIQUE,
  is_claimed BOOLEAN DEFAULT FALSE,
  claimed_by_user_id UUID REFERENCES users(id),
  claimed_at TIMESTAMP,
  sent_at TIMESTAMP DEFAULT NOW(),
  scheduled_for TIMESTAMP,
  expiration_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- gift_drafts (for multi-step gift creation flow)
CREATE TABLE IF NOT EXISTS gift_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  gift_card_id UUID REFERENCES gift_cards(id),
  bundle_id UUID REFERENCES bundles(id),
  gift_type gift_type,
  credit_amount DECIMAL(10, 2),
  sender_name VARCHAR(100),
  recipient_name VARCHAR(100),
  personal_message TEXT,
  theme gift_theme,
  delivery_channel delivery_channel,
  recipient_phone VARCHAR(20),
  recipient_email VARCHAR(255),
  recipient_name_field VARCHAR(100),
  scheduled_for TIMESTAMP,
  stripe_payment_intent_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50) NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  amount DECIMAL(12, 2),
  currency_code VARCHAR(3),
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255),
  message TEXT,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_merchants_category ON merchants(category_id);
CREATE INDEX IF NOT EXISTS idx_merchants_country ON merchants(country_code);
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON merchants(slug);
CREATE INDEX IF NOT EXISTS idx_merchants_active ON merchants(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_merchants_name_trgm ON merchants USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gift_cards_merchant ON gift_cards(merchant_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_active ON gift_cards(is_active);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_intent ON purchases(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_gift_instances_purchase ON gift_instances(purchase_id);
CREATE INDEX IF NOT EXISTS idx_gift_instances_gift_card ON gift_instances(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gift_instances_redemption_code ON gift_instances(redemption_code);
CREATE INDEX IF NOT EXISTS idx_gift_instances_redeemed_by ON gift_instances(redeemed_by_merchant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_items_user ON wallet_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_items_gift_instance ON wallet_items(gift_instance_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_sender ON gifts_sent(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_recipient ON gifts_sent(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sent_share_link ON gifts_sent(unique_share_link);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
