'use strict';

const stripe = require('../config/stripe');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Create a Stripe PaymentIntent.
 */
async function createPaymentIntent({ amount, currency = 'usd', metadata = {}, customerId }) {
  try {
    const params = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (customerId) {
      params.customer = customerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(params);

    logger.info('Payment intent created', {
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
    });

    return paymentIntent;
  } catch (err) {
    logger.error('Failed to create payment intent', { error: err.message, amount, currency });
    throw new AppError(`Payment initialization failed: ${err.message}`, 502, 'PAYMENT_INIT_FAILED');
  }
}

/**
 * Retrieve a PaymentIntent from Stripe.
 */
async function getPaymentIntent(paymentIntentId) {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    logger.error('Failed to retrieve payment intent', { paymentIntentId, error: err.message });
    throw new AppError('Payment record not found', 404, 'PAYMENT_NOT_FOUND');
  }
}

/**
 * Verify that a PaymentIntent succeeded.
 */
async function verifyPaymentSuccess(paymentIntentId) {
  const paymentIntent = await getPaymentIntent(paymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    throw new AppError(
      `Payment has not been completed (status: ${paymentIntent.status})`,
      400,
      'PAYMENT_NOT_COMPLETED'
    );
  }
  return paymentIntent;
}

/**
 * Create or retrieve a Stripe customer for a user.
 */
async function getOrCreateStripeCustomer(userId, email, name) {
  try {
    const customer = await stripe.customers.create({
      email,
      name: name || email,
      metadata: { kado_user_id: userId },
    });
    logger.info('Stripe customer created', { customerId: customer.id, userId });
    return customer;
  } catch (err) {
    logger.error('Failed to create Stripe customer', { userId, error: err.message });
    throw new AppError('Failed to set up payment customer', 502, 'STRIPE_CUSTOMER_ERROR');
  }
}

/**
 * Process a refund for a charge.
 */
async function createRefund(chargeId, amount) {
  try {
    const params = { charge: chargeId };
    if (amount) {
      params.amount = Math.round(amount * 100);
    }
    const refund = await stripe.refunds.create(params);
    logger.info('Refund created', { refundId: refund.id, chargeId });
    return refund;
  } catch (err) {
    logger.error('Failed to create refund', { chargeId, error: err.message });
    throw new AppError(`Refund failed: ${err.message}`, 502, 'REFUND_FAILED');
  }
}

/**
 * Construct Stripe webhook event from raw body and signature.
 */
function constructWebhookEvent(rawBody, signature) {
  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new AppError(`Webhook signature verification failed: ${err.message}`, 400, 'WEBHOOK_SIGNATURE_INVALID');
  }
}

module.exports = {
  createPaymentIntent,
  getPaymentIntent,
  verifyPaymentSuccess,
  getOrCreateStripeCustomer,
  createRefund,
  constructWebhookEvent,
};
