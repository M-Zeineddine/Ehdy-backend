'use strict';

const cron = require('node-cron');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Re-drive Tap webhooks that were persisted but not successfully processed
 * (e.g. the process crashed between ack and fulfilment, or fulfilment hit a
 * transient error). Fulfilment is idempotent, so re-processing is safe.
 * Only rows older than 2 minutes are picked up, to avoid racing the inline
 * setImmediate handler of a freshly-received webhook.
 */
async function reconcilePendingWebhooks() {
  const { processTapWebhook } = require('../routes/webhooks');

  const result = await query(
    `SELECT id, raw_payload FROM payment_webhooks
     WHERE processed = FALSE AND received_at < NOW() - INTERVAL '2 minutes'
     ORDER BY received_at ASC
     LIMIT 50`,
    []
  );

  if (result.rows.length) {
    logger.info(`Reconciling ${result.rows.length} unprocessed payment webhook(s)`);
  }

  for (const row of result.rows) {
    try {
      // raw_payload is jsonb → pg returns an object; tolerate a string too.
      const charge = typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : row.raw_payload;
      await processTapWebhook(row.id, charge);
    } catch (err) {
      logger.error('Webhook reconciliation failed for row', { id: row.id, error: err.message });
    }
  }
}

/**
 * Schedule the reconciliation job (every 5 minutes).
 */
function scheduleReconcileWebhooks() {
  cron.schedule('*/5 * * * *', () => {
    reconcilePendingWebhooks().catch((err) =>
      logger.error('reconcileWebhooks job error', { error: err.message })
    );
  });
  logger.info('Scheduled reconcileWebhooks job (every 5 minutes)');
}

module.exports = { reconcilePendingWebhooks, scheduleReconcileWebhooks };
