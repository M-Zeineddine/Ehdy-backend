'use strict';

const { query } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get a single gift card by ID with merchant info.
 */
async function getGiftCardById(giftCardId) {
  const result = await query(
    `SELECT gc.id, gc.merchant_id, gc.name, gc.description, gc.type,
            gc.is_store_credit, gc.credit_amount, gc.item_name, gc.item_sku,
            gc.item_price, gc.item_image_url, gc.currency_code, gc.image_url,
            gc.valid_from_days, gc.valid_until_days, gc.is_active, gc.created_at,
            m.name as merchant_name, m.slug as merchant_slug, m.logo_url as merchant_logo_url,
            m.city as merchant_city, m.is_active as merchant_is_active
     FROM gift_cards gc
     JOIN merchants m ON m.id = gc.merchant_id
     WHERE gc.id = $1 AND gc.is_active = TRUE AND m.deleted_at IS NULL`,
    [giftCardId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Gift card not found', 404, 'GIFT_CARD_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Get multiple gift cards by IDs.
 */
async function getGiftCardsByIds(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `SELECT gc.*, m.name as merchant_name, m.logo_url as merchant_logo_url
     FROM gift_cards gc
     JOIN merchants m ON m.id = gc.merchant_id
     WHERE gc.id IN (${placeholders}) AND gc.is_active = TRUE`,
    ids
  );
  return result.rows;
}

/**
 * Calculate effective price for a gift card (for store credit, it's the credit_amount; for items, it's item_price).
 */
function getEffectivePrice(giftCard) {
  if (giftCard.type === 'store_credit') {
    return parseFloat(giftCard.credit_amount) || 0;
  }
  return parseFloat(giftCard.item_price) || 0;
}

/**
 * Calculate expiration date from gift card settings.
 */
function calculateExpirationDate(giftCard, purchasedAt = new Date()) {
  const daysUntil = giftCard.valid_until_days || 365;
  const expDate = new Date(purchasedAt);
  expDate.setDate(expDate.getDate() + daysUntil);
  return expDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * List active gift cards with merchant info. Used for the "Popular Gifts" home feed.
 */
async function listGiftCards({ limit = 10, merchant_id } = {}) {
  const conditions = ['gc.is_active = TRUE', 'm.deleted_at IS NULL', 'm.is_active = TRUE'];
  const params = [];
  let idx = 1;

  if (merchant_id) {
    conditions.push(`gc.merchant_id = $${idx++}`);
    params.push(merchant_id);
  }

  params.push(limit);

  const result = await query(
    `SELECT gc.id, gc.merchant_id, gc.name, gc.description, gc.type,
            gc.is_store_credit, gc.credit_amount, gc.currency_code, gc.image_url,
            m.name as merchant_name, m.slug as merchant_slug, m.logo_url as merchant_logo_url
     FROM gift_cards gc
     JOIN merchants m ON m.id = gc.merchant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.rating DESC, gc.credit_amount ASC NULLS LAST
     LIMIT $${idx}`,
    params
  );

  return result.rows;
}

module.exports = {
  getGiftCardById,
  getGiftCardsByIds,
  listGiftCards,
  getEffectivePrice,
  calculateExpirationDate,
};
