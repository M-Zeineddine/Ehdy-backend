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
            m.country_code, m.city, m.address, m.latitude, m.longitude,
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
            m.country_code, m.city, m.address, m.latitude, m.longitude,
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

module.exports = {
  listMerchants,
  getMerchantById,
  listCategories,
  getMerchantForPortal,
};
