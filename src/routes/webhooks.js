'use strict';

const router = require('express').Router();
const { constructWebhookEvent } = require('../services/paymentService');
const { fulfillPurchase, failPurchase } = require('../services/purchaseService');
const emailService = require('../services/emailService');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Stripe webhook handler.
 * Note: This route must receive the raw body (not parsed JSON).
 * The express.raw() middleware is applied at the route level in index.js.
 */
const stripeWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    logger.warn('Stripe webhook received without signature');
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', { error: err.message });
    return res.status(400).json({ error: err.message });
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  // Acknowledge receipt immediately
  res.status(200).json({ received: true });

  // Process asynchronously
  setImmediate(async () => {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          const chargeId = paymentIntent.latest_charge;

          const purchase = await fulfillPurchase(paymentIntent.id, chargeId);

          if (purchase) {
            // Send confirmation email
            const userResult = await query(
              'SELECT email, first_name FROM users WHERE id = $1',
              [purchase.user_id]
            );
            if (userResult.rows.length > 0) {
              const user = userResult.rows[0];
              const items = typeof purchase.items === 'string'
                ? JSON.parse(purchase.items)
                : purchase.items;

              await emailService.sendPurchaseConfirmationEmail({
                email: user.email,
                firstName: user.first_name,
                purchase,
                items: items.map(i => ({
                  name: i.gift_card_name,
                  amount: i.subtotal,
                  currency: i.currency_code,
                })),
              });
            }
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          const failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';

          const purchase = await failPurchase(paymentIntent.id, failureReason);

          if (purchase) {
            const userResult = await query(
              'SELECT email, first_name FROM users WHERE id = $1',
              [purchase.user_id]
            );
            if (userResult.rows.length > 0) {
              const user = userResult.rows[0];
              await emailService.sendPaymentFailedEmail({
                email: user.email,
                firstName: user.first_name,
                amount: purchase.total_amount,
                currency: purchase.currency_code,
                reason: failureReason,
              });
            }
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object;
          const paymentIntentId = charge.payment_intent;
          await query(
            `UPDATE purchases SET payment_status = 'refunded', updated_at = NOW()
             WHERE stripe_payment_intent_id = $1`,
            [paymentIntentId]
          );
          logger.info('Purchase refunded', { paymentIntentId });
          break;
        }

        default:
          logger.debug('Unhandled Stripe webhook event', { type: event.type });
      }
    } catch (processingErr) {
      logger.error('Error processing Stripe webhook', {
        eventType: event.type,
        error: processingErr.message,
        stack: processingErr.stack,
      });
    }
  });
};

router.post('/stripe', stripeWebhook);

module.exports = router;
