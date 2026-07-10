'use strict';

const cron = require('node-cron');
const { query } = require('../utils/database');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

// Notify this many days before expiry. Exact-day equality (not a range) so a
// daily run warns each gift exactly once.
const NOTIFY_DAYS_BEFORE = 7;

/**
 * Find gift instances that expire exactly NOTIFY_DAYS_BEFORE days from today.
 *
 * gift_instances.expiration_date is `date`, so the window uses date arithmetic
 * (CURRENT_DATE + $1::int -> date), never NOW()/interval against a timestamp.
 *
 * Uses the live model: merchant_items / custom_credit_merchant_id (the old
 * gift_cards join was unrunnable after migration 003 dropped that table).
 * Exported separately so the predicate can be tested without sending email.
 */
async function findExpiringGifts(daysBefore = NOTIFY_DAYS_BEFORE) {
  const result = await query(
    `SELECT gi.id, gi.redemption_code, gi.expiration_date,
            gi.current_balance, gi.currency_code,
            CASE
              WHEN gi.merchant_item_id IS NOT NULL THEN mi.name
              ELSE CONCAT(gi.initial_balance::text, ' ', gi.currency_code, ' Store Credit')
            END AS gift_name,
            COALESCE(m_mi.name, m_cc.name) AS merchant_name,
            wi.user_id,
            u.email, u.first_name
     FROM gift_instances gi
     LEFT JOIN merchant_items mi   ON mi.id   = gi.merchant_item_id
     LEFT JOIN merchants     m_mi  ON m_mi.id = mi.merchant_id
     LEFT JOIN merchants     m_cc  ON m_cc.id = gi.custom_credit_merchant_id
     JOIN wallet_items wi ON wi.gift_instance_id = gi.id
     JOIN users        u  ON u.id = wi.user_id
     WHERE gi.is_redeemed = FALSE
       AND gi.expiration_date = CURRENT_DATE + $1::int
       AND u.deleted_at IS NULL`,
    [daysBefore]
  );
  return result.rows;
}

/**
 * Notify wallet owners about gifts expiring in NOTIFY_DAYS_BEFORE days.
 * Runs daily at 09:00 Beirut time.
 *
 * Throws on failure — the scheduler wrapper logs it loudly. This job silently
 * swallowed its own exception for months after migration 014/003, so nothing
 * ever noticed it was broken. Per-gift failures are caught and counted so one
 * bad row cannot kill the whole run, but a run-level failure is never hidden.
 */
async function checkExpiringGifts() {
  logger.info('Running checkExpiringGifts job');

  const gifts = await findExpiringGifts();
  logger.info(`checkExpiringGifts: ${gifts.length} gift(s) expiring in ${NOTIFY_DAYS_BEFORE} days`);

  let notified = 0;
  let failed = 0;

  for (const gift of gifts) {
    try {
      // No transaction here: each notification is an independent insert and
      // nothing else must commit atomically with it. createNotification is
      // overloaded — pass an explicit null client so it uses the pool.
      await notificationService.createNotification(null, {
        userId: gift.user_id,
        type: 'gift_expiring_soon',
        title: 'Gift expiring soon!',
        message: `Your ${gift.gift_name}${gift.merchant_name ? ` from ${gift.merchant_name}` : ''} expires on ${gift.expiration_date}. Use it before it expires!`,
        relatedEntityType: 'gift_instance',
        relatedEntityId: gift.id,
        metadata: { expiration_date: gift.expiration_date },
      });

      await emailService.sendEmail({
        to: gift.email,
        subject: 'Your Ehdy gift expires in 7 days!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #e53e3e;">⏰ Gift Expiring Soon!</h1>
            <p>Hi ${gift.first_name || 'there'},</p>
            <p>Your <strong>${gift.gift_name}</strong>${gift.merchant_name ? ` from <strong>${gift.merchant_name}</strong>` : ''} expires on <strong>${gift.expiration_date}</strong>.</p>
            ${gift.current_balance ? `<p>Remaining balance: <strong>${gift.currency_code} ${gift.current_balance}</strong></p>` : ''}
            <p>Don't let it go to waste - use it before it expires!</p>
          </div>
        `,
      });

      notified += 1;
      logger.debug('Expiration notification sent', { giftInstanceId: gift.id, userId: gift.user_id });
    } catch (notifErr) {
      failed += 1;
      logger.error('Failed to send expiration notification', {
        giftInstanceId: gift.id,
        error: notifErr.message,
      });
    }
  }

  logger.info(`checkExpiringGifts complete: notified=${notified} failed=${failed} total=${gifts.length}`);
  return { total: gifts.length, notified, failed };
}

/**
 * Schedule the job (daily 09:00 Beirut). A run-level failure is logged loudly.
 */
function scheduleCheckExpiringGifts() {
  cron.schedule(
    '0 9 * * *',
    () => {
      checkExpiringGifts().catch((err) =>
        logger.error('checkExpiringGifts job FAILED', { error: err.message, stack: err.stack })
      );
    },
    { timezone: 'Asia/Beirut' }
  );
  logger.info('Scheduled checkExpiringGifts job (daily at 9:00 AM Beirut time)');
}

module.exports = { findExpiringGifts, checkExpiringGifts, scheduleCheckExpiringGifts };
