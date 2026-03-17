'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Factory helpers for generating consistent mock data in tests.
 * Call each factory with optional overrides to customise specific fields.
 */

const merchants = {
  active: (overrides = {}) => ({
    id: uuidv4(),
    name: 'Patchi',
    slug: 'patchi',
    description: 'Luxury Lebanese chocolates',
    logo_url: 'https://example.com/logo.png',
    banner_image_url: 'https://example.com/banner.png',
    category_id: uuidv4(),
    category_name: 'Food & Drinks',
    category_slug: 'food-drinks',
    country_code: 'LB',
    contact_email: 'info@patchi.com',
    contact_phone: '+9611234567',
    is_active: true,
    is_verified: true,
    is_featured: false,
    rating: '4.5',
    review_count: 120,
    website_url: 'https://patchi.com',
    created_at: new Date().toISOString(),
    items: [],
    store_credit_presets: [],
    stripe_account_id: 'acct_secret_should_be_stripped',
    ...overrides,
  }),
};

const users = {
  active: (overrides = {}) => ({
    id: uuidv4(),
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    is_email_verified: true,
    country_code: 'LB',
    currency_code: 'USD',
    language: 'en',
    ...overrides,
  }),
};

const merchantItems = {
  standard: (merchantId = uuidv4(), overrides = {}) => ({
    id: uuidv4(),
    merchant_id: merchantId,
    name: 'Chocolate Box',
    description: 'Premium gift box',
    image_url: 'https://example.com/item.png',
    price: '25.00',
    currency_code: 'USD',
    item_sku: 'CHOC-001',
    is_active: true,
    ...overrides,
  }),
};

const storeCreditPresets = {
  standard: (merchantId = uuidv4(), overrides = {}) => ({
    id: uuidv4(),
    merchant_id: merchantId,
    amount: '50.00',
    currency_code: 'USD',
    is_active: true,
    ...overrides,
  }),
};

const giftParams = {
  base: (overrides = {}) => ({
    sender_name: 'Alice',
    recipient_name: 'Bob',
    recipient_phone: '+9611234567',
    personal_message: 'Happy Birthday!',
    theme: 'birthday',
    ...overrides,
  }),
};

module.exports = { merchants, users, merchantItems, storeCreditPresets, giftParams };
