'use strict';

const router = require('express').Router();
const { fulfillGiftFromTap } = require('../services/giftService');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Process a Tap webhook. The body is only an untrusted TRIGGER — we do not
 * verify a body signature and do not act on the body's status/amount.
 * fulfillGiftFromTap re-fetches the authoritative charge from Tap (DB-gated,
 * one fetch) and decides everything from that.
 *
 * Transient failures (Tap unreachable / 429 / 5xx) throw -> processed stays
 * false so the reconciliation cron re-drives the row. Any terminal outcome
 * (fulfilled / not captured / amount mismatch / no matching gift) returns and
 * marks processed = true. Exported so the reconciliation job reuses it.
 */
async function processTapWebhook(webhookRowId, charge) {
  const chargeId = charge?.id;
  let processed = false;
  let errorMessage = null;

  try {
    if (!chargeId) {
      logger.warn('Tap webhook missing charge id', { webhookRowId });
      errorMessage = 'missing charge id';
      processed = true; // nothing to retry
    } else {
      logger.info('Tap webhook processing', { chargeId, bodyStatus: charge?.status });
      // Authoritative: fulfillGiftFromTap gates on our DB, re-fetches the charge
      // from Tap, and fulfils only a validated CAPTURED charge.
      await fulfillGiftFromTap(chargeId);
      processed = true;
    }
  } catch (err) {
    // Transient failure (e.g. Tap unreachable) — leave processed = false so the
    // reconciliation cron re-drives it. Never mark done on a transient error.
    errorMessage = err.message;
    logger.error('Error processing Tap webhook (will retry)', { error: err.message, stack: err.stack });
  }

  if (webhookRowId) {
    try {
      await query(
        `UPDATE payment_webhooks SET processed = $1, error_message = $2 WHERE id = $3`,
        [processed, errorMessage, webhookRowId]
      );
    } catch (logErr) {
      logger.error('Failed to update payment webhook status', { error: logErr.message });
    }
  }
}

/**
 * Tap Payments webhook handler.
 * Tap POSTs the full charge object to this URL on status changes.
 */
const tapWebhook = async (req, res) => {
  const charge = req.body;
  const chargeId = charge?.id || null;
  const status = charge?.status || null;

  // Persist the raw payload BEFORE acknowledging, so a crash mid-processing
  // never loses the event — the reconciliation job re-drives unprocessed rows.
  let webhookRowId = null;
  try {
    const ins = await query(
      `INSERT INTO payment_webhooks (provider, charge_id, status, raw_payload, processed)
       VALUES ('tap', $1, $2, $3, FALSE) RETURNING id`,
      [chargeId, status, JSON.stringify(charge)]
    );
    webhookRowId = ins.rows[0].id;
  } catch (logErr) {
    logger.error('Failed to persist payment webhook', { error: logErr.message });
  }

  // Acknowledge immediately — Tap expects a 200 quickly
  res.status(200).json({ received: true });

  setImmediate(() => processTapWebhook(webhookRowId, charge));
};

router.post('/tap', tapWebhook);

router.processTapWebhook = processTapWebhook;
module.exports = router;
