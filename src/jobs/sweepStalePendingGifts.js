'use strict';

const cron = require('node-cron');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Fail abandoned pending gifts. A pending gifts_sent row left by an abandoned
 * checkout otherwise stays pending forever, and — with the partial unique index
 * gifts_sent_one_pending_per_draft — every retry on that draft 409s against a
 * dead Tap session. Flipping it to 'failed' frees the draft (the index only
 * covers pending rows).
 *
 * A row is only failed when NO CAPTURED webhook exists for its charge — the
 * payment_webhooks row is the proof a real capture happened. If a genuine
 * capture later arrives for a swept row, fulfillGiftFromTap re-opens it
 * (bounded 'failed' branch), so this never drops a paid gift.
 */
async function sweepStalePendingGifts() {
  const result = await query(
    `UPDATE gifts_sent gs
     SET payment_status = 'failed', updated_at = NOW()
     WHERE gs.payment_status = 'pending'
       AND gs.created_at < NOW() - INTERVAL '30 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM payment_webhooks pw
         WHERE pw.charge_id = gs.tap_charge_id
           AND pw.status = 'CAPTURED'
       )
     RETURNING gs.id`,
    []
  );

  if (result.rows.length) {
    logger.info(`Swept ${result.rows.length} stale pending gift(s) to failed`);
  }
}

/**
 * Schedule the sweeper (every 10 minutes — well under the 30-minute window).
 */
function scheduleSweepStalePendingGifts() {
  cron.schedule('*/10 * * * *', () => {
    sweepStalePendingGifts().catch((err) =>
      logger.error('sweepStalePendingGifts job error', { error: err.message })
    );
  });
  logger.info('Scheduled sweepStalePendingGifts job (every 10 minutes)');
}

module.exports = { sweepStalePendingGifts, scheduleSweepStalePendingGifts };
