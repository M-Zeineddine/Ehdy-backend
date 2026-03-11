'use strict';

const { query, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { generateQRCode } = require('../utils/qrCode');

/**
 * Get all wallet items for a user, with summary stats.
 */
async function getWalletItems(userId, { page, limit, status }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const conditions = ['wi.user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (status === 'active') {
    conditions.push('gi.is_redeemed = FALSE');
    conditions.push(`(gi.expiration_date IS NULL OR gi.expiration_date >= CURRENT_DATE)`);
  } else if (status === 'redeemed') {
    conditions.push('gi.is_redeemed = TRUE');
  } else if (status === 'expired') {
    conditions.push('gi.expiration_date < CURRENT_DATE');
    conditions.push('gi.is_redeemed = FALSE');
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM wallet_items wi
     JOIN gift_instances gi ON gi.id = wi.gift_instance_id
     WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(lim, offset);

  const result = await query(
    `SELECT wi.id, wi.gift_instance_id, wi.sender_user_id, wi.custom_message,
            wi.is_favorite, wi.received_at, wi.viewed_at,
            gi.redemption_code, gi.current_balance, gi.initial_balance,
            gi.is_redeemed, gi.redeemed_at, gi.expiration_date, gi.currency_code,
            gi.item_claimed,
            gc.id as gift_card_id, gc.name as gift_card_name, gc.type as gift_card_type,
            gc.image_url, gc.is_store_credit, gc.credit_amount, gc.item_name, gc.item_price,
            gc.item_image_url,
            m.id as merchant_id, m.name as merchant_name, m.logo_url as merchant_logo_url,
            m.city as merchant_city,
            u.first_name as sender_first_name, u.last_name as sender_last_name
     FROM wallet_items wi
     JOIN gift_instances gi ON gi.id = wi.gift_instance_id
     JOIN gift_cards gc ON gc.id = gi.gift_card_id
     JOIN merchants m ON m.id = gc.merchant_id
     LEFT JOIN users u ON u.id = wi.sender_user_id
     WHERE ${whereClause}
     ORDER BY wi.is_favorite DESC, wi.received_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  // Summary stats
  const summaryResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE AND (gi.expiration_date IS NULL OR gi.expiration_date >= CURRENT_DATE)) as active_count,
       COUNT(*) FILTER (WHERE gi.is_redeemed = TRUE) as redeemed_count,
       COUNT(*) FILTER (WHERE gi.expiration_date < CURRENT_DATE AND gi.is_redeemed = FALSE) as expired_count,
       SUM(gi.current_balance) FILTER (WHERE gi.is_redeemed = FALSE AND gi.current_balance IS NOT NULL) as total_balance
     FROM wallet_items wi
     JOIN gift_instances gi ON gi.id = wi.gift_instance_id
     WHERE wi.user_id = $1`,
    [userId]
  );

  const summary = summaryResult.rows[0];

  return {
    items: result.rows,
    summary: {
      active_count: parseInt(summary.active_count, 10) || 0,
      redeemed_count: parseInt(summary.redeemed_count, 10) || 0,
      expired_count: parseInt(summary.expired_count, 10) || 0,
      total_balance: parseFloat(summary.total_balance) || 0,
    },
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get a single wallet item with QR code.
 */
async function getWalletItem(walletItemId, userId) {
  const result = await query(
    `SELECT wi.id, wi.gift_instance_id, wi.sender_user_id, wi.custom_message,
            wi.is_favorite, wi.received_at, wi.viewed_at,
            gi.redemption_code, gi.redemption_qr_code, gi.current_balance,
            gi.initial_balance, gi.is_redeemed, gi.redeemed_at, gi.expiration_date,
            gi.currency_code, gi.item_claimed, gi.redeemed_amount,
            gc.id as gift_card_id, gc.name as gift_card_name, gc.type as gift_card_type,
            gc.description as gift_card_description, gc.image_url,
            gc.is_store_credit, gc.credit_amount, gc.item_name, gc.item_price,
            gc.item_image_url, gc.item_sku, gc.valid_until_days,
            m.id as merchant_id, m.name as merchant_name, m.logo_url as merchant_logo_url,
            m.city as merchant_city, m.address as merchant_address,
            m.contact_phone as merchant_phone,
            u.first_name as sender_first_name, u.last_name as sender_last_name
     FROM wallet_items wi
     JOIN gift_instances gi ON gi.id = wi.gift_instance_id
     JOIN gift_cards gc ON gc.id = gi.gift_card_id
     JOIN merchants m ON m.id = gc.merchant_id
     LEFT JOIN users u ON u.id = wi.sender_user_id
     WHERE wi.id = $1 AND wi.user_id = $2`,
    [walletItemId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet item not found', 404, 'WALLET_ITEM_NOT_FOUND');
  }

  const item = result.rows[0];

  // Mark as viewed if not already
  if (!item.viewed_at) {
    await query(
      'UPDATE wallet_items SET viewed_at = NOW() WHERE id = $1',
      [walletItemId]
    );
    item.viewed_at = new Date().toISOString();
  }

  // Generate fresh QR code if needed
  if (!item.redemption_qr_code) {
    item.redemption_qr_code = await generateQRCode(item.redemption_code);
  }

  return item;
}

/**
 * Toggle favorite status on a wallet item.
 */
async function toggleFavorite(walletItemId, userId) {
  const result = await query(
    `UPDATE wallet_items SET is_favorite = NOT is_favorite
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_favorite`,
    [walletItemId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet item not found', 404, 'WALLET_ITEM_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Update notes / custom message on a wallet item.
 */
async function updateNotes(walletItemId, userId, { custom_message }) {
  const result = await query(
    `UPDATE wallet_items SET custom_message = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id, custom_message`,
    [custom_message, walletItemId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet item not found', 404, 'WALLET_ITEM_NOT_FOUND');
  }

  return result.rows[0];
}

module.exports = {
  getWalletItems,
  getWalletItem,
  toggleFavorite,
  updateNotes,
};
