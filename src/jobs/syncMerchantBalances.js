'use strict';

const cron = require('node-cron');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Sync merchant balance summaries.
 * Calculates and caches redemption stats per merchant.
 * Runs hourly.
 */
async function syncMerchantBalances() {
  logger.info('Running syncMerchantBalances job');

  try {
    // Get all active merchants
    const merchantsResult = await query(
      'SELECT id FROM merchants WHERE is_active = TRUE AND deleted_at IS NULL',
      []
    );

    let processed = 0;
    let errors = 0;

    for (const merchant of merchantsResult.rows) {
      try {
        // Calculate today's redemptions
        const statsResult = await query(
          `SELECT
             COUNT(*) FILTER (WHERE gi.redeemed_at::date = CURRENT_DATE) as today_redemptions,
             SUM(gi.redeemed_amount) FILTER (WHERE gi.redeemed_at::date = CURRENT_DATE) as today_amount,
             COUNT(*) FILTER (WHERE gi.is_redeemed = FALSE AND gi.expiration_date >= CURRENT_DATE) as active_codes,
             COUNT(*) FILTER (WHERE gi.expiration_date < CURRENT_DATE AND gi.is_redeemed = FALSE) as expired_codes
           FROM gift_instances gi
           JOIN gift_cards gc ON gc.id = gi.gift_card_id
           WHERE gc.merchant_id = $1`,
          [merchant.id]
        );

        const stats = statsResult.rows[0];

        // Update merchant record with computed stats (if we had a stats column)
        // For now, just log the sync
        logger.debug('Merchant balance synced', {
          merchantId: merchant.id,
          today_redemptions: stats.today_redemptions,
          active_codes: stats.active_codes,
        });

        processed++;
      } catch (merchantErr) {
        logger.error('Failed to sync merchant balance', {
          merchantId: merchant.id,
          error: merchantErr.message,
        });
        errors++;
      }
    }

    logger.info('syncMerchantBalances job complete', { processed, errors });
  } catch (err) {
    logger.error('syncMerchantBalances job failed', { error: err.message, stack: err.stack });
  }
}

/**
 * Clean up expired gift instances (mark fully expired codes).
 */
async function cleanupExpiredGifts() {
  try {
    const result = await query(
      `UPDATE gift_instances
       SET is_redeemed = TRUE, updated_at = NOW()
       WHERE expiration_date < CURRENT_DATE
         AND is_redeemed = FALSE
         AND (current_balance IS NULL OR current_balance = 0)
       RETURNING id`,
      []
    );

    if (result.rowCount > 0) {
      logger.info('Cleaned up expired gift instances', { count: result.rowCount });
    }
  } catch (err) {
    logger.error('cleanupExpiredGifts failed', { error: err.message });
  }
}

/**
 * Schedule jobs.
 */
function scheduleSyncMerchantBalances() {
  // Sync merchant balances every hour
  cron.schedule('0 * * * *', syncMerchantBalances);
  logger.info('Scheduled syncMerchantBalances job (hourly)');

  // Cleanup expired gifts daily at midnight
  cron.schedule('0 0 * * *', cleanupExpiredGifts, {
    timezone: 'Asia/Beirut',
  });
  logger.info('Scheduled cleanupExpiredGifts job (daily at midnight)');
}

module.exports = { syncMerchantBalances, cleanupExpiredGifts, scheduleSyncMerchantBalances };
