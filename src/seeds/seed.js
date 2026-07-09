'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const categories = require('./categories.json');
const merchants = require('./merchants.json');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'ehdy_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seedCategories(client) {
  console.log('Seeding categories...');
  const categoryMap = {};

  for (const cat of categories) {
    const existing = await client.query('SELECT id FROM categories WHERE slug = $1', [cat.slug]);
    if (existing.rows.length > 0) {
      categoryMap[cat.slug] = existing.rows[0].id;
      continue;
    }
    const result = await client.query(
      `INSERT INTO categories (name, slug, description, display_order)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [cat.name, cat.slug, cat.description || null, cat.display_order || 0]
    );
    categoryMap[cat.slug] = result.rows[0].id;
    console.log(`  Created category: ${cat.name}`);
  }
  return categoryMap;
}

/**
 * Seed merchants and their catalog onto the CURRENT schema:
 *   - merchants: no city/address/latitude/longitude (dropped by migration 008)
 *   - gift_item entries  -> merchant_items
 *   - store_credit entries -> store_credit_presets
 * Returns slug -> { merchantId, items: [{ id, price, currency_code }] }
 */
async function seedMerchants(client, categoryMap) {
  console.log('\nSeeding merchants + catalog...');
  const merchantMap = {};

  for (const merchant of merchants) {
    const categoryId = categoryMap[merchant.category_slug];
    if (!categoryId) {
      console.warn(`  Unknown category slug: ${merchant.category_slug}, skipping ${merchant.name}`);
      continue;
    }

    let merchantId;
    const existing = await client.query('SELECT id FROM merchants WHERE slug = $1', [merchant.slug]);
    if (existing.rows.length > 0) {
      merchantId = existing.rows[0].id;
    } else {
      const result = await client.query(
        `INSERT INTO merchants
           (name, slug, description, website_url, category_id, country_code,
            contact_email, contact_phone, is_active, is_verified, rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          merchant.name,
          merchant.slug,
          merchant.description,
          merchant.website_url || null,
          categoryId,
          merchant.country_code || 'LB',
          merchant.contact_email || null,
          merchant.contact_phone || null,
          merchant.is_active !== false,
          merchant.is_verified || false,
          merchant.rating || 0,
          merchant.review_count || 0,
        ]
      );
      merchantId = result.rows[0].id;
      console.log(`  Created merchant: ${merchant.name}`);
    }

    const items = [];
    for (const gc of merchant.gift_cards || []) {
      if (gc.type === 'gift_item') {
        const name = gc.item_name || gc.name;
        const ex = await client.query(
          'SELECT id, price, currency_code FROM merchant_items WHERE merchant_id = $1 AND name = $2',
          [merchantId, name]
        );
        if (ex.rows.length > 0) {
          items.push(ex.rows[0]);
          continue;
        }
        const mi = await client.query(
          `INSERT INTO merchant_items (merchant_id, name, description, price, currency_code, item_sku, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE)
           RETURNING id, price, currency_code`,
          [merchantId, name, gc.description || null, gc.item_price || null, gc.currency_code || 'USD', gc.item_sku || null]
        );
        items.push(mi.rows[0]);
        console.log(`    Created merchant_item: ${name}`);
      } else {
        const ex = await client.query(
          'SELECT id FROM store_credit_presets WHERE merchant_id = $1 AND amount = $2 AND currency_code = $3',
          [merchantId, gc.credit_amount, gc.currency_code || 'USD']
        );
        if (ex.rows.length > 0) continue;
        await client.query(
          `INSERT INTO store_credit_presets (merchant_id, amount, currency_code, is_active)
           VALUES ($1,$2,$3,TRUE)`,
          [merchantId, gc.credit_amount, gc.currency_code || 'USD']
        );
        console.log(`    Created store_credit_preset: ${gc.credit_amount} ${gc.currency_code || 'USD'}`);
      }
    }

    merchantMap[merchant.slug] = { merchantId, items };
  }

  return merchantMap;
}

/**
 * Build a full redemption fixture end-to-end so the first redemption test has
 * real data: a user, a paid gifts_sent (gift_item), its gift_instance, and a
 * wallet_items row owned by the user. Idempotent via a fixed share link.
 */
async function seedRedemptionFixture(client, merchantMap) {
  console.log('\nSeeding redemption fixture...');

  const entry = Object.values(merchantMap).find((m) => m.items && m.items.length > 0);
  if (!entry) {
    console.warn('  No merchant_item available — cannot build redemption fixture');
    return;
  }
  const item = entry.items[0];

  // Recipient user (idempotent by email)
  const email = 'test.recipient@kado.dev';
  let userId;
  const uex = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (uex.rows.length > 0) {
    userId = uex.rows[0].id;
  } else {
    const hash = await bcrypt.hash('Password123', 12);
    const ur = await client.query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name, phone, country_code,
          is_email_verified, email_verified_at, is_phone_verified, phone_verified_at)
       VALUES ($1,$2,'Test','Recipient','+9613000000','LB',TRUE,NOW(),TRUE,NOW())
       RETURNING id`,
      [email, hash]
    );
    userId = ur.rows[0].id;
    console.log(`  Created test user: ${email}`);
  }

  const shareLink = 'seed-fixture-gift-0001';
  const gex = await client.query('SELECT id FROM gifts_sent WHERE unique_share_link = $1', [shareLink]);
  if (gex.rows.length > 0) {
    console.log('  Redemption fixture already exists — skipping');
    return;
  }

  // Paid gift (merchant_item). gifts_sent no longer has a type-exclusivity CHECK
  // (dropped with store_credit_preset_id in migration 016), but keep only
  // merchant_item_id set for a clean gift-item gift.
  const gs = await client.query(
    `INSERT INTO gifts_sent
       (sender_user_id, recipient_user_id, recipient_name, recipient_phone,
        merchant_item_id, sender_name, personal_message, unique_share_link,
        payment_status, delivery_channel)
     VALUES ($1,$1,'Test Recipient','+9613000000',$2,'Seed Sender','Enjoy your gift!',$3,'paid','whatsapp')
     RETURNING id`,
    [userId, item.id, shareLink]
  );
  const giftSentId = gs.rows[0].id;

  // gift_instance (gift_item → balances NULL)
  const redemptionCode = 'SEED-0001';
  const gi = await client.query(
    `INSERT INTO gift_instances
       (merchant_item_id, redemption_code, currency_code, gift_sent_id, type,
        initial_balance, current_balance)
     VALUES ($1,$2,$3,$4,'gift_item',NULL,NULL)
     RETURNING id`,
    [item.id, redemptionCode, item.currency_code || 'USD', giftSentId]
  );
  const giftInstanceId = gi.rows[0].id;

  // wallet_items owned by the recipient
  await client.query(
    `INSERT INTO wallet_items (user_id, gift_instance_id, sender_user_id, gift_sent_id)
     VALUES ($1,$2,$1,$3)
     ON CONFLICT DO NOTHING`,
    [userId, giftInstanceId, giftSentId]
  );

  console.log(`  Redemption fixture ready: redemption_code=${redemptionCode} user=${email} gift_sent=${giftSentId}`);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting database seed...\n');
    await client.query('BEGIN');

    const categoryMap = await seedCategories(client);
    const merchantMap = await seedMerchants(client, categoryMap);
    await seedRedemptionFixture(client, merchantMap);

    await client.query('COMMIT');
    console.log('\nSeed completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nSeed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
