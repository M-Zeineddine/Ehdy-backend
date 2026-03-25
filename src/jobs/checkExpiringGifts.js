'use strict';

const cron = require('node-cron');
const { query } = require('../utils/database');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * Check for gifts expiring in the next 7 days and notify owners.
 * Runs daily at 9:00 AM.
 */
async function checkExpiringGifts() {
  logger.info('Running checkExpiringGifts job');

  try {
    // Find gift instances expiring in 7 days that haven't been redeemed
    const result = await query(
      `SELECT gi.id, gi.redemption_code, gi.expiration_date, gi.current_balance, gi.currency_code,
              gc.name as gift_card_name, m.name as merchant_name,
              wi.user_id,
              u.email, u.first_name
       FROM gift_instances gi
       JOIN gift_cards gc ON gc.id = gi.gift_card_id
       JOIN merchants m ON m.id = gc.merchant_id
       JOIN wallet_items wi ON wi.gift_instance_id = gi.id
       JOIN users u ON u.id = wi.user_id
       WHERE gi.is_redeemed = FALSE
         AND gi.expiration_date = CURRENT_DATE + INTERVAL '7 days'
         AND u.deleted_at IS NULL`,
      []
    );

    logger.info(`Found ${result.rows.length} expiring gifts`);

    for (const gift of result.rows) {
      try {
        // Create in-app notification
        await notificationService.createNotification({
          userId: gift.user_id,
          type: 'gift_expiring_soon',
          title: 'Gift expiring soon!',
          message: `Your ${gift.gift_card_name} from ${gift.merchant_name} expires on ${gift.expiration_date}. Use it before it expires!`,
          relatedEntityType: 'gift_instance',
          relatedEntityId: gift.id,
          metadata: { expiration_date: gift.expiration_date },
        });

        // Send email notification
        await emailService.sendEmail({
          to: gift.email,
          subject: `Your Ehdy gift expires in 7 days!`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #e53e3e;">⏰ Gift Expiring Soon!</h1>
              <p>Hi ${gift.first_name || 'there'},</p>
              <p>Your <strong>${gift.gift_card_name}</strong> from <strong>${gift.merchant_name}</strong> expires on <strong>${gift.expiration_date}</strong>.</p>
              ${gift.current_balance ? `<p>Remaining balance: <strong>${gift.currency_code} ${gift.current_balance}</strong></p>` : ''}
              <p>Don't let it go to waste - use it before it expires!</p>
              <a href="${process.env.FRONTEND_URL || 'https://ehdy.app'}/wallet"
                 style="background: #6B46C1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 16px;">
                View My Wallet
              </a>
            </div>
          `,
        });

        logger.debug('Expiration notification sent', { giftId: gift.id, userId: gift.user_id });
      } catch (notifErr) {
        logger.error('Failed to send expiration notification', {
          giftId: gift.id,
          error: notifErr.message,
        });
      }
    }

    logger.info('checkExpiringGifts job complete');
  } catch (err) {
    logger.error('checkExpiringGifts job failed', { error: err.message, stack: err.stack });
  }
}

/**
 * Schedule the job.
 */
function scheduleCheckExpiringGifts() {
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', checkExpiringGifts, {
    timezone: 'Asia/Beirut',
  });
  logger.info('Scheduled checkExpiringGifts job (daily at 9:00 AM Beirut time)');
}

module.exports = { checkExpiringGifts, scheduleCheckExpiringGifts };
