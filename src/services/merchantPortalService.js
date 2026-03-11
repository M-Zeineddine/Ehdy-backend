'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

/**
 * Merchant portal login.
 */
async function merchantLogin({ email, password }) {
  const result = await query(
    `SELECT mu.id, mu.merchant_id, mu.email, mu.password_hash,
            mu.first_name, mu.last_name, mu.is_active,
            m.name as merchant_name, m.is_active as merchant_is_active
     FROM merchant_users mu
     JOIN merchants m ON m.id = mu.merchant_id
     WHERE mu.email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const merchantUser = result.rows[0];

  if (!merchantUser.is_active) {
    throw new AppError('Your account is not active', 403, 'ACCOUNT_INACTIVE');
  }

  if (!merchantUser.merchant_is_active) {
    throw new AppError('The merchant account is not active', 403, 'MERCHANT_INACTIVE');
  }

  const passwordMatch = await bcrypt.compare(password, merchantUser.password_hash);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    {
      merchantUserId: merchantUser.id,
      merchantId: merchantUser.merchant_id,
      type: 'merchant',
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  logger.info('Merchant user logged in', {
    merchantUserId: merchantUser.id,
    merchantId: merchantUser.merchant_id,
  });

  return {
    token,
    merchant_user: {
      id: merchantUser.id,
      email: merchantUser.email,
      first_name: merchantUser.first_name,
      last_name: merchantUser.last_name,
      merchant_id: merchantUser.merchant_id,
      merchant_name: merchantUser.merchant_name,
    },
  };
}

/**
 * Get dashboard stats for the merchant portal.
 */
async function getMerchantDashboard(merchantId) {
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today} 00:00:00`;
  const endOfDay = `${today} 23:59:59`;

  // Today's stats
  const todayStats = await query(
    `SELECT
       COUNT(*) FILTER (WHERE gi.redeemed_at BETWEEN $1 AND $2) as today_redemptions,
       SUM(gi.redeemed_amount) FILTER (WHERE gi.redeemed_at BETWEEN $1 AND $2) as today_revenue,
       COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE AND gi.expiration_date >= CURRENT_DATE) as active_codes
     FROM gift_instances gi
     JOIN gift_cards gc ON gc.id = gi.gift_card_id
     WHERE gc.merchant_id = $3`,
    [startOfDay, endOfDay, merchantId]
  );

  // This month stats
  const monthStats = await query(
    `SELECT
       COUNT(*) as month_redemptions,
       SUM(gi.redeemed_amount) as month_revenue
     FROM gift_instances gi
     JOIN gift_cards gc ON gc.id = gi.gift_card_id
     WHERE gc.merchant_id = $1
       AND gi.is_redeemed = TRUE
       AND DATE_TRUNC('month', gi.redeemed_at) = DATE_TRUNC('month', CURRENT_DATE)`,
    [merchantId]
  );

  // Recent redemptions
  const recentRedemptions = await query(
    `SELECT gi.redemption_code, gi.redeemed_at, gi.redeemed_amount, gi.currency_code,
            gc.name as gift_card_name, gc.type
     FROM gift_instances gi
     JOIN gift_cards gc ON gc.id = gi.gift_card_id
     WHERE gc.merchant_id = $1 AND gi.is_redeemed = TRUE
     ORDER BY gi.redeemed_at DESC
     LIMIT 10`,
    [merchantId]
  );

  // Gift card breakdown
  const giftCardStats = await query(
    `SELECT gc.id, gc.name, gc.type,
            COUNT(*) FILTER (WHERE gi.is_redeemed = TRUE) as times_redeemed,
            COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE) as active_instances,
            SUM(gi.redeemed_amount) as total_redeemed_value
     FROM gift_cards gc
     LEFT JOIN gift_instances gi ON gi.gift_card_id = gc.id
     WHERE gc.merchant_id = $1 AND gc.is_active = TRUE
     GROUP BY gc.id, gc.name, gc.type
     ORDER BY times_redeemed DESC`,
    [merchantId]
  );

  const stats = todayStats.rows[0];
  const month = monthStats.rows[0];

  return {
    today: {
      redemptions: parseInt(stats.today_redemptions, 10) || 0,
      revenue: parseFloat(stats.today_revenue) || 0,
      active_codes: parseInt(stats.active_codes, 10) || 0,
    },
    this_month: {
      redemptions: parseInt(month.month_redemptions, 10) || 0,
      revenue: parseFloat(month.month_revenue) || 0,
    },
    recent_redemptions: recentRedemptions.rows,
    gift_card_breakdown: giftCardStats.rows,
  };
}

module.exports = {
  merchantLogin,
  getMerchantDashboard,
};
