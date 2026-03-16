'use strict';

const { query, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * List merchants with optional filters.
 */
async function listMerchants({ category_id, search, country_code, page, limit, is_active = true, is_featured }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const conditions = ['m.deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (is_active) {
    conditions.push('m.is_active = TRUE');
  }

  if (is_featured) {
    conditions.push('m.is_featured = TRUE');
  }

  if (category_id) {
    conditions.push(`m.category_id = $${idx++}`);
    params.push(category_id);
  }

  if (country_code) {
    conditions.push(`m.country_code = $${idx++}`);
    params.push(country_code.toUpperCase());
  }

  if (search) {
    conditions.push(`(m.name ILIKE $${idx} OR m.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM merchants m ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(lim, offset);

  const result = await query(
    `SELECT m.id, m.name, m.slug, m.description, m.logo_url, m.banner_image_url,
            m.category_id, c.name as category_name, c.slug as category_slug,
            m.country_code,
            m.contact_email, m.contact_phone, m.is_active, m.is_verified,
            m.rating, m.review_count, m.website_url, m.created_at
     FROM merchants m
     JOIN categories c ON c.id = m.category_id
     ${whereClause}
     ORDER BY m.rating DESC, m.name ASC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return {
    merchants: result.rows,
    pagination: {
      total,
      page: pg,
      limit: lim,
      pages: Math.ceil(total / lim),
    },
  };
}

/**
 * Get merchant by ID or slug with their gift cards.
 */
async function getMerchantById(merchantId) {
  const result = await query(
    `SELECT m.id, m.name, m.slug, m.description, m.logo_url, m.banner_image_url,
            m.category_id, c.name as category_name, c.slug as category_slug,
            m.country_code,
            m.contact_email, m.contact_phone, m.is_active, m.is_verified,
            m.rating, m.review_count, m.website_url, m.created_at
     FROM merchants m
     JOIN categories c ON c.id = m.category_id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [merchantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
  }

  const merchant = result.rows[0];

  // Get merchant items
  const items = await query(
    `SELECT id, name, description, image_url, price, currency_code, item_sku
     FROM merchant_items
     WHERE merchant_id = $1 AND is_active = TRUE
     ORDER BY name ASC`,
    [merchantId]
  );

  // Get store credit presets
  const storeCredits = await query(
    `SELECT id, amount, currency_code
     FROM store_credit_presets
     WHERE merchant_id = $1 AND is_active = TRUE
     ORDER BY amount ASC`,
    [merchantId]
  );

  merchant.items = items.rows;
  merchant.store_credit_presets = storeCredits.rows;
  return merchant;
}

/**
 * List merchant items across all merchants (for popular gifts feed).
 */
async function listMerchantItems({ limit = 6 } = {}) {
  const result = await query(
    `SELECT mi.id, mi.name, mi.description, mi.image_url, mi.price, mi.currency_code,
            mi.merchant_id, m.name as merchant_name,
            COUNT(gi.id) AS gift_count
     FROM merchant_items mi
     JOIN merchants m ON m.id = mi.merchant_id
     LEFT JOIN gift_instances gi ON gi.merchant_item_id = mi.id
     WHERE mi.is_active = TRUE AND m.is_active = TRUE AND m.deleted_at IS NULL
     GROUP BY mi.id, m.name
     ORDER BY gift_count DESC, mi.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * List all active categories.
 */
async function listCategories() {
  const result = await query(
    `SELECT id, name, slug, description, icon_url, display_order
     FROM categories
     WHERE is_active = TRUE
     ORDER BY display_order ASC, name ASC`
  );
  return result.rows;
}

/**
 * Get merchant by ID for internal use (includes sensitive fields).
 */
async function getMerchantForPortal(merchantId) {
  const result = await query(
    'SELECT * FROM merchants WHERE id = $1 AND deleted_at IS NULL',
    [merchantId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
  }
  return result.rows[0];
}

/**
 * Record a merchant page visit for an authenticated user.
 * Writes to two tables:
 *   - merchant_visits: append-only event log (used by analytics)
 *   - user_merchant_last_visit: upserted (used by recently-viewed)
 * Fire-and-forget — callers must not propagate errors from this to the user.
 */
async function recordVisit(merchantId, userId) {
  await Promise.all([
    query(
      'INSERT INTO merchant_visits (merchant_id, user_id) VALUES ($1, $2)',
      [merchantId, userId]
    ),
    query(
      `INSERT INTO user_merchant_last_visit (user_id, merchant_id, last_visited_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, merchant_id) DO UPDATE SET last_visited_at = NOW()`,
      [userId, merchantId]
    ),
  ]);
}

/**
 * Get recently visited distinct merchants for a user.
 * Reads from user_merchant_last_visit (one row per user+merchant pair) —
 * a simple index scan regardless of how large merchant_visits grows.
 */
async function getRecentlyViewed(userId, limit = 10) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 20);
  const result = await query(
    `SELECT
       ulv.merchant_id     AS id,
       m.name,
       m.slug,
       m.logo_url,
       m.banner_image_url,
       m.is_verified,
       m.is_featured,
       m.rating,
       m.review_count,
       c.name AS category_name,
       c.slug AS category_slug,
       ulv.last_visited_at AS visited_at
     FROM user_merchant_last_visit ulv
     JOIN merchants  m ON m.id  = ulv.merchant_id
     JOIN categories c ON c.id  = m.category_id
     WHERE ulv.user_id     = $1
       AND m.is_active   = TRUE
       AND m.deleted_at IS NULL
     ORDER BY ulv.last_visited_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );
  return result.rows;
}

/**
 * Visit analytics for a merchant (used by admin CMS).
 * Returns total + unique visitor counts plus a daily breakdown.
 *
 * Note on unique visitors:
 *   - `unique_visitors` = distinct user_ids across the entire period (e.g. 50 people in 30 days)
 *   - `daily_breakdown[n].unique` = distinct user_ids on that specific day
 *   A user visiting on Monday AND Tuesday counts as 1 in the period total
 *   but as 1+1 in the sum of daily uniques. These are intentionally different metrics.
 */
async function getVisitAnalytics(merchantId, days = 30) {
  const safeDays = Math.min(Math.max(1, parseInt(days, 10) || 30), 365);

  const [totalsResult, dailyResult] = await Promise.all([
    query(
      `SELECT
         COUNT(*)                AS total_visits,
         COUNT(DISTINCT user_id) AS unique_visitors
       FROM merchant_visits
       WHERE merchant_id = $1
         AND visited_at >= NOW() - ($2::int * INTERVAL '1 day')`,
      [merchantId, safeDays]
    ),
    query(
      `SELECT
         DATE(visited_at)        AS date,
         COUNT(*)                AS total,
         COUNT(DISTINCT user_id) AS unique
       FROM merchant_visits
       WHERE merchant_id = $1
         AND visited_at >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY DATE(visited_at)
       ORDER BY date ASC`,
      [merchantId, safeDays]
    ),
  ]);

  return {
    period_days: safeDays,
    total_visits: parseInt(totalsResult.rows[0].total_visits, 10),
    unique_visitors: parseInt(totalsResult.rows[0].unique_visitors, 10),
    daily_breakdown: dailyResult.rows,
  };
}

module.exports = {
  listMerchants,
  getMerchantById,
  listMerchantItems,
  listCategories,
  getMerchantForPortal,
  recordVisit,
  getRecentlyViewed,
  getVisitAnalytics,
};
