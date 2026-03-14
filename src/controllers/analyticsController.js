'use strict';

const { query } = require('../utils/database');
const { successResponse } = require('../utils/formatters');

const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Wallet summary
    const walletSummary = await query(
      `SELECT
         COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE AND (gi.expiration_date IS NULL OR gi.expiration_date >= CURRENT_DATE)) as active_gifts,
         COUNT(*) FILTER (WHERE gi.is_redeemed = TRUE) as redeemed_gifts,
         SUM(gi.current_balance) FILTER (WHERE gi.is_redeemed = FALSE AND gi.current_balance IS NOT NULL) as total_wallet_balance
       FROM wallet_items wi
       JOIN gift_instances gi ON gi.id = wi.gift_instance_id
       WHERE wi.user_id = $1`,
      [userId]
    );

    // Gifts sent / received counts
    const giftStats = await query(
      `SELECT
         (SELECT COUNT(*) FROM gifts_sent WHERE sender_user_id = $1) as gifts_sent,
         (SELECT COUNT(*) FROM gifts_sent WHERE recipient_user_id = $1 OR claimed_by_user_id = $1) as gifts_received`,
      [userId]
    );

    // Total spent (completed purchases)
    const spendingStats = await query(
      `SELECT
         COUNT(*) as total_purchases,
         SUM(total_amount) as total_spent,
         currency_code
       FROM purchases
       WHERE user_id = $1 AND payment_status = 'succeeded'
       GROUP BY currency_code`,
      [userId]
    );

    // Monthly spending trend (last 6 months)
    const monthlySpend = await query(
      `SELECT
         DATE_TRUNC('month', purchased_at) as month,
         SUM(total_amount) as amount,
         COUNT(*) as purchases,
         currency_code
       FROM purchases
       WHERE user_id = $1
         AND payment_status = 'succeeded'
         AND purchased_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', purchased_at), currency_code
       ORDER BY month ASC`,
      [userId]
    );

    // Recent transactions
    const recentTransactions = await query(
      `SELECT id, transaction_type, amount, currency_code, status, description, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Favorite merchants
    const favoriteMerchants = await query(
      `SELECT m.id, m.name, m.logo_url, COUNT(gi.id) as gift_count
       FROM gift_instances gi
       JOIN merchant_items mi ON mi.id = gi.merchant_item_id
       JOIN merchants m ON m.id = mi.merchant_id
       JOIN wallet_items wi ON wi.gift_instance_id = gi.id
       WHERE wi.user_id = $1
       GROUP BY m.id, m.name, m.logo_url
       ORDER BY gift_count DESC
       LIMIT 5`,
      [userId]
    );

    const ws = walletSummary.rows[0];
    const gs = giftStats.rows[0];

    return successResponse(res, {
      wallet: {
        active_gifts: parseInt(ws.active_gifts, 10) || 0,
        redeemed_gifts: parseInt(ws.redeemed_gifts, 10) || 0,
        total_balance: parseFloat(ws.total_wallet_balance) || 0,
      },
      gifting: {
        gifts_sent: parseInt(gs.gifts_sent, 10) || 0,
        gifts_received: parseInt(gs.gifts_received, 10) || 0,
      },
      spending: spendingStats.rows,
      monthly_trend: monthlySpend.rows,
      recent_transactions: recentTransactions.rows,
      favorite_merchants: favoriteMerchants.rows,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getUserDashboard };
