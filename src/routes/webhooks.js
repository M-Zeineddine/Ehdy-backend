'use strict';

const crypto = require('crypto');
const router = require('express').Router();
const { fulfillGiftFromTap, failGiftFromTap } = require('../services/giftService');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Verify Tap webhook signature.
 * Tap computes HMAC-SHA256 over "id|amount|currency|status" using your secret key
 * and sends it as the `hashstring` field in the payload.
 * See: https://developers.tap.company/docs/webhook
 */
function verifyTapSignature(charge) {
  const secret = process.env.TAP_SECRET_KEY;
  if (!secret) {
    // Fail closed: without a key we cannot verify the signature.
    logger.error('Tap webhook rejected: TAP_SECRET_KEY is not configured');
    return false;
  }

  const hashstring = charge?.hashstring;
  if (!hashstring) {
    logger.warn('Tap webhook missing hashstring');
    return false;
  }

  const payload = [
    charge.id,
    charge.amount,
    charge.currency,
    charge.status,
  ].join('|');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Guard hashstring format before Buffer/timingSafeEqual: must be hex of the
  // same length as the digest, otherwise reject without relying on a throw.
  if (typeof hashstring !== 'string' || !/^[0-9a-fA-F]+$/.test(hashstring) || hashstring.length !== expected.length) {
    logger.warn('Tap webhook hashstring malformed or wrong length');
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(hashstring, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Process a Tap charge payload and record the outcome on its payment_webhooks
 * row. Exported so the reconciliation job can re-drive unprocessed rows.
 * Only genuine exceptions (transient failures) leave processed = false; a
 * rejected signature or an unhandled status is terminal (processed = true).
 */
async function processTapWebhook(webhookRowId, charge) {
  const chargeId = charge?.id;
  const status = charge?.status;
  let processed = false;
  let errorMessage = null;

  try {
    if (!chargeId) {
      logger.warn('Tap webhook missing charge id', { webhookRowId });
      errorMessage = 'missing charge id';
      processed = true; // nothing to retry
    } else if (!verifyTapSignature(charge)) {
      logger.warn('Tap webhook signature verification failed', { chargeId });
      errorMessage = 'signature verification failed';
      processed = true; // rejected, not retryable
    } else {
      logger.info('Tap webhook processing', { chargeId, status });
      if (status === 'CAPTURED') {
        await fulfillGiftFromTap(chargeId);
      } else if (status === 'FAILED' || status === 'CANCELLED') {
        await failGiftFromTap(chargeId);
      } else {
        logger.debug('Unhandled Tap charge status', { chargeId, status });
      }
      processed = true;
    }
  } catch (err) {
    // Transient failure — leave processed = false so reconciliation retries.
    errorMessage = err.message;
    logger.error('Error processing Tap webhook', { error: err.message, stack: err.stack });
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
