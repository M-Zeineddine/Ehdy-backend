'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
    const existing = await client.query(
      'SELECT id FROM categories WHERE slug = $1',
      [cat.slug]
    );

    if (existing.rows.length > 0) {
      console.log(`  Category already exists: ${cat.name}`);
      categoryMap[cat.slug] = existing.rows[0].id;
      continue;
    }

    const result = await client.query(
      `INSERT INTO categories (name, slug, description, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [cat.name, cat.slug, cat.description || null, cat.display_order || 0]
    );

    categoryMap[cat.slug] = result.rows[0].id;
    console.log(`  Created category: ${cat.name}`);
  }

  return categoryMap;
}

async function seedMerchants(client, categoryMap) {
  console.log('\nSeeding merchants...');

  for (const merchant of merchants) {
    const categoryId = categoryMap[merchant.category_slug];
    if (!categoryId) {
      console.warn(`  Unknown category slug: ${merchant.category_slug}, skipping ${merchant.name}`);
      continue;
    }

    let merchantId;
    const existing = await client.query(
      'SELECT id FROM merchants WHERE slug = $1',
      [merchant.slug]
    );

    if (existing.rows.length > 0) {
      merchantId = existing.rows[0].id;
      console.log(`  Merchant already exists: ${merchant.name}`);
    } else {
      const result = await client.query(
        `INSERT INTO merchants
           (name, slug, description, website_url, category_id, country_code, city,
            address, latitude, longitude, contact_email, contact_phone,
            is_active, is_verified, rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          merchant.name,
          merchant.slug,
          merchant.description,
          merchant.website_url || null,
          categoryId,
          merchant.country_code || 'LB',
          merchant.city,
          merchant.address,
          merchant.latitude || null,
          merchant.longitude || null,
          merchant.contact_email || null,
          merchant.contact_phone || null,
          merchant.is_active !== false,
          merchant.is_verified || false,
          merchant.rating || 0,
          merchant.review_count || 0,
        ]
      );
      merchantId = result.rows[0].id;
      console.log(`  Created merchant: ${merchant.name} (${merchantId})`);
    }

    // Seed gift cards
    if (merchant.gift_cards && merchant.gift_cards.length > 0) {
      for (const gc of merchant.gift_cards) {
        const gcExisting = await client.query(
          'SELECT id FROM gift_cards WHERE merchant_id = $1 AND name = $2',
          [merchantId, gc.name]
        );

        if (gcExisting.rows.length > 0) {
          console.log(`    Gift card already exists: ${gc.name}`);
          continue;
        }

        await client.query(
          `INSERT INTO gift_cards
             (merchant_id, name, description, type, is_store_credit,
              credit_amount, item_name, item_sku, item_price,
              currency_code, valid_until_days, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            merchantId,
            gc.name,
            gc.description || null,
            gc.type,
            gc.is_store_credit || false,
            gc.credit_amount || null,
            gc.item_name || null,
            gc.item_sku || null,
            gc.item_price || null,
            gc.currency_code || 'LBP',
            gc.valid_until_days || 365,
            true,
          ]
        );
        console.log(`    Created gift card: ${gc.name}`);
      }
    }
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting database seed...\n');
    await client.query('BEGIN');

    const categoryMap = await seedCategories(client);
    await seedMerchants(client, categoryMap);

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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
