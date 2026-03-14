'use strict';

const tap = require('../config/tap');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Create a Tap charge and return the hosted payment URL.
 *
 * @param {object} opts
 * @param {number}  opts.amount        - Amount in major units (e.g. 25.00)
 * @param {string}  opts.currency      - ISO currency code (default 'USD')
 * @param {object}  opts.metadata      - Key/value metadata stored on the charge
 * @param {object}  opts.customer      - { first_name, email } for Tap
 * @param {string}  opts.redirectUrl   - Deep link back to the app (e.g. kado://payment/callback)
 * @param {string}  opts.postUrl       - Webhook URL for Tap to POST charge updates
 * @returns {Promise<{ id: string, transaction_url: string }>}
 */
async function createTapCharge({ amount, currency = 'USD', metadata = {}, customer = {}, redirectUrl, postUrl }) {
  if (!tap.secretKey) {
    throw new AppError('Tap secret key not configured', 500, 'TAP_NOT_CONFIGURED');
  }

  const body = {
    amount,
    currency: currency.toUpperCase(),
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: 'Kado Gift Purchase',
    metadata,
    reference: { transaction: `kado_${metadata.gift_sent_id || Date.now()}` },
    receipt: { email: false, sms: false },
    customer: {
      first_name: customer.first_name || 'Customer',
      email: customer.email || undefined,
    },
    source: { id: 'src_all' },
    post: { url: postUrl },
    redirect: { url: redirectUrl },
  };

  const response = await fetch(`${tap.baseUrl}/charges`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tap.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    logger.error('Tap charge creation failed', { status: response.status, data });
    throw new AppError(
      `Payment initialization failed: ${data?.errors?.[0]?.description || response.statusText}`,
      502,
      'PAYMENT_INIT_FAILED'
    );
  }

  logger.info('Tap charge created', { chargeId: data.id, amount, currency });
  return { id: data.id, transaction_url: data.transaction?.url };
}

/**
 * Verify that a Tap charge is in CAPTURED status.
 * Used by gift/bundle flows to confirm payment before fulfilling.
 * @param {string} tapChargeId - The Tap charge ID (e.g. chg_xxx)
 */
async function verifyPaymentSuccess(tapChargeId) {
  if (!tapChargeId) {
    throw new AppError('Payment charge ID is required', 400, 'MISSING_CHARGE_ID');
  }
  const charge = await getTapCharge(tapChargeId);
  if (charge.status !== 'CAPTURED') {
    throw new AppError(
      `Payment not completed. Status: ${charge.status}`,
      400,
      'PAYMENT_NOT_CAPTURED'
    );
  }
  return charge;
}

/**
 * Retrieve a Tap charge by ID.
 */
async function getTapCharge(chargeId) {
  const response = await fetch(`${tap.baseUrl}/charges/${chargeId}`, {
    headers: { Authorization: `Bearer ${tap.secretKey}` },
  });

  if (!response.ok) {
    throw new AppError('Charge not found', 404, 'PAYMENT_NOT_FOUND');
  }

  return response.json();
}

module.exports = {
  createTapCharge,
  getTapCharge,
  verifyPaymentSuccess,
};
