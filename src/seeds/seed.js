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

const TEST_EMAIL = 'test.recipient@kado.dev';

/**
 * Idempotently create the shared test recipient user.
 */
async function ensureTestUser(client) {
  const uex = await client.query('SELECT id FROM users WHERE email = $1', [TEST_EMAIL]);
  if (uex.rows.length > 0) return uex.rows[0].id;

  const hash = await bcrypt.hash('Password123', 12);
  const ur = await client.query(
    `INSERT INTO users
       (email, password_hash, first_name, last_name, phone, country_code,
        is_email_verified, email_verified_at, is_phone_verified, phone_verified_at)
     VALUES ($1,$2,'Test','Recipient','+9613000000','LB',TRUE,NOW(),TRUE,NOW())
     RETURNING id`,
    [TEST_EMAIL, hash]
  );
  console.log(`  Created test user: ${TEST_EMAIL}`);
  return ur.rows[0].id;
}

/**
 * Build a full redemption fixture end-to-end so the first redemption test has
 * real data: a user, a paid gifts_sent (gift_item), its gift_instance, and a
 * wallet_items row owned by the user. Idempotent via a fixed share link.
 */
async function seedRedemptionFixture(client, merchantMap, userId) {
  console.log('\nSeeding redemption fixture...');

  const entry = Object.values(merchantMap).find((m) => m.items && m.items.length > 0);
  if (!entry) {
    console.warn('  No merchant_item available — cannot build redemption fixture');
    return;
  }
  const item = entry.items[0];

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

  console.log(`  Redemption fixture ready: redemption_code=${redemptionCode} user=${TEST_EMAIL} gift_sent=${giftSentId}`);
}

/**
 * Expiry fixtures for the checkExpiringGifts cron. The job selects gifts with
 * expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 that have no
 * existing gift_expiring_soon notification. Only EXP-INWIN and EXP-3DAY must
 * match; the rest prove each exclusion arm of the predicate.
 */
const EXPIRY_FIXTURES = [
  { code: 'EXP-INWIN',    days: 7,  redeemed: false, preNotified: false, note: 'range upper bound -> MUST notify' },
  { code: 'EXP-3DAY',     days: 3,  redeemed: false, preNotified: false, note: 'inside range -> MUST notify (proves range)' },
  { code: 'EXP-OUTWIN',   days: 30, redeemed: false, preNotified: false, note: 'outside range' },
  { code: 'EXP-PAST',     days: -1, redeemed: false, preNotified: false, note: 'already expired' },
  { code: 'EXP-REDEEMED', days: 7,  redeemed: true,  preNotified: false, note: 'redeemed, in range' },
  { code: 'EXP-NOTIFIED', days: 5,  redeemed: false, preNotified: true,  note: 'already notified -> dedupe excludes (proves dedupe)' },
];

async function seedExpiryFixtures(client, merchantMap, userId) {
  console.log('\nSeeding expiry fixtures...');

  const entry = Object.values(merchantMap).find((m) => m.items && m.items.length > 0);
  if (!entry) {
    console.warn('  No merchant_item available — cannot build expiry fixtures');
    return;
  }
  const item = entry.items[0];

  for (const f of EXPIRY_FIXTURES) {
    const ex = await client.query('SELECT id FROM gift_instances WHERE redemption_code = $1', [f.code]);
    if (ex.rows.length > 0) {
      console.log(`  ${f.code} already exists — skipping`);
      continue;
    }

    // expiration_date is `date`: CURRENT_DATE + int -> date (no interval math).
    const gi = await client.query(
      `INSERT INTO gift_instances
         (merchant_item_id, redemption_code, currency_code, type, expiration_date,
          is_redeemed, redeemed_at)
       VALUES ($1,$2,$3,'gift_item', CURRENT_DATE + $4::int, $5,
               CASE WHEN $5 THEN NOW() ELSE NULL END)
       RETURNING id`,
      [item.id, f.code, item.currency_code || 'USD', f.days, f.redeemed]
    );

    await client.query(
      `INSERT INTO wallet_items (user_id, gift_instance_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [userId, gi.rows[0].id]
    );

    if (f.preNotified) {
      // Must match the cron's NOT EXISTS dedupe exactly.
      await client.query(
        `INSERT INTO notifications
           (user_id, type, title, message, related_entity_type, related_entity_id)
         VALUES ($1,'gift_expiring_soon','Gift expiring soon!','seeded prior notification','gift_instance',$2)`,
        [userId, gi.rows[0].id]
      );
    }

    console.log(`  ${f.code}: expires CURRENT_DATE${f.days >= 0 ? '+' : ''}${f.days}, redeemed=${f.redeemed}, preNotified=${f.preNotified} (${f.note})`);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting database seed...\n');
    await client.query('BEGIN');

    const categoryMap = await seedCategories(client);
    const merchantMap = await seedMerchants(client, categoryMap);
    const userId = await ensureTestUser(client);
    await seedRedemptionFixture(client, merchantMap, userId);
    await seedExpiryFixtures(client, merchantMap, userId);

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
