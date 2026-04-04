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
  if (!secret) return true; // skip if key not configured (dev only)

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

  return crypto.timingSafeEqual(
    Buffer.from(hashstring, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Tap Payments webhook handler.
 * Tap POSTs the full charge object to this URL on status changes.
 */
const tapWebhook = async (req, res) => {
  // Acknowledge immediately — Tap expects a 200 quickly
  res.status(200).json({ received: true });

  setImmediate(async () => {
    const charge = req.body;
    const chargeId = charge?.id;
    const status = charge?.status;
    let processed = false;
    let errorMessage = null;

    try {
      if (!chargeId) {
        logger.warn('Tap webhook missing charge id', { body: req.body });
        return;
      }

      if (!verifyTapSignature(charge)) {
        logger.warn('Tap webhook signature verification failed', { chargeId });
        return;
      }

      logger.info('Tap webhook received', { chargeId, status });

      if (status === 'CAPTURED') {
        await fulfillGiftFromTap(chargeId);
        processed = true;
      } else if (status === 'FAILED' || status === 'CANCELLED') {
        await failGiftFromTap(chargeId);
        processed = true;
      } else {
        logger.debug('Unhandled Tap charge status', { chargeId, status });
      }
    } catch (err) {
      errorMessage = err.message;
      logger.error('Error processing Tap webhook', { error: err.message, stack: err.stack });
    }

    try {
      await query(
        `INSERT INTO payment_webhooks (provider, charge_id, status, raw_payload, processed, error_message)
         VALUES ('tap', $1, $2, $3, $4, $5)`,
        [chargeId || null, status || null, JSON.stringify(charge), processed, errorMessage]
      );
    } catch (logErr) {
      logger.error('Failed to log payment webhook', { error: logErr.message });
    }
  });
};

router.post('/tap', tapWebhook);

module.exports = router;
