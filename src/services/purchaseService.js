'use strict';

const { query, withTransaction, buildPagination } = require('../utils/database');
const { AppError } = require('../middleware/errorHandler');
const { getGiftCardsByIds, getEffectivePrice } = require('./giftCardService');
const { createPaymentIntent } = require('./paymentService');
const logger = require('../utils/logger');

/**
 * Create a purchase record and Stripe PaymentIntent.
 */
async function createPurchase(userId, { items, currency_code = 'USD', payment_method }) {
  // Validate and fetch gift cards
  const giftCardIds = items.map(i => i.gift_card_id);
  const giftCards = await getGiftCardsByIds(giftCardIds);

  if (giftCards.length !== giftCardIds.length) {
    throw new AppError('One or more gift cards not found', 400, 'GIFT_CARDS_NOT_FOUND');
  }

  const giftCardMap = {};
  for (const gc of giftCards) {
    giftCardMap[gc.id] = gc;
  }

  // Calculate total
  let totalAmount = 0;
  const enrichedItems = items.map(item => {
    const gc = giftCardMap[item.gift_card_id];
    const price = getEffectivePrice(gc);
    const subtotal = price * item.quantity;
    totalAmount += subtotal;
    return {
      gift_card_id: gc.id,
      gift_card_name: gc.name,
      merchant_id: gc.merchant_id,
      merchant_name: gc.merchant_name,
      quantity: item.quantity,
      unit_price: price,
      subtotal,
      currency_code: gc.currency_code,
    };
  });

  // Get user's Stripe customer ID
  const userResult = await query(
    'SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];

  // Create Stripe PaymentIntent
  const paymentIntent = await createPaymentIntent({
    amount: totalAmount,
    currency: currency_code,
    metadata: {
      ehdy_user_id: userId,
      item_count: items.length,
    },
    customerId: user.stripe_customer_id,
  });

  // Create purchase record in DB
  const result = await query(
    `INSERT INTO purchases (user_id, items, total_amount, currency_code, payment_status, payment_method, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [
      userId,
      JSON.stringify(enrichedItems),
      totalAmount,
      currency_code,
      payment_method || null,
      paymentIntent.id,
    ]
  );

  const purchase = result.rows[0];

  // Log transaction record
  await query(
    `INSERT INTO transactions (user_id, transaction_type, related_entity_type, related_entity_id, amount, currency_code, status, description)
     VALUES ($1, 'purchase_initiated', 'purchase', $2, $3, $4, 'pending', 'Gift card purchase initiated')`,
    [userId, purchase.id, totalAmount, currency_code]
  );

  logger.info('Purchase created', { purchaseId: purchase.id, userId, totalAmount });

  return {
    purchase,
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
  };
}

/**
 * Get purchase history for a user.
 */
async function getUserPurchases(userId, { page, limit }) {
  const { offset, limit: lim, page: pg } = buildPagination(page, limit);

  const countResult = await query(
    'SELECT COUNT(*) FROM purchases WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT id, items, total_amount, currency_code, payment_status, payment_method, purchased_at
     FROM purchases WHERE user_id = $1
     ORDER BY purchased_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, offset]
  );

  return {
    purchases: result.rows,
    pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
  };
}

/**
 * Get a single purchase by ID.
 */
async function getPurchaseById(purchaseId, userId) {
  const result = await query(
    `SELECT p.*,
            array_agg(json_build_object(
              'id', gi.id,
              'redemption_code', gi.redemption_code,
              'is_redeemed', gi.is_redeemed,
              'expiration_date', gi.expiration_date,
              'current_balance', gi.current_balance
            )) as gift_instances
     FROM purchases p
     LEFT JOIN gift_instances gi ON gi.purchase_id = p.id
     WHERE p.id = $1 AND p.user_id = $2
     GROUP BY p.id`,
    [purchaseId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Purchase not found', 404, 'PURCHASE_NOT_FOUND');
  }

  return result.rows[0];
}

/**
 * Mark a purchase as succeeded and create gift instances.
 * Called from the Stripe webhook handler.
 */
async function fulfillPurchase(stripePaymentIntentId, chargeId) {
  return withTransaction(async (client) => {
    // Get the purchase
    const purchaseResult = await client.query(
      `SELECT * FROM purchases WHERE stripe_payment_intent_id = $1 AND payment_status = 'pending'`,
      [stripePaymentIntentId]
    );

    if (purchaseResult.rows.length === 0) {
      logger.warn('Purchase not found or already fulfilled', { stripePaymentIntentId });
      return null;
    }

    const purchase = purchaseResult.rows[0];

    // Update purchase status
    await client.query(
      `UPDATE purchases SET payment_status = 'succeeded', stripe_charge_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [chargeId, purchase.id]
    );

    // Update transaction record
    await client.query(
      `UPDATE transactions SET status = 'completed' WHERE related_entity_id = $1 AND transaction_type = 'purchase_initiated'`,
      [purchase.id]
    );

    // Import here to avoid circular dependency
    const giftInstanceService = require('./giftService');
    await giftInstanceService.createGiftInstancesFromPurchase(client, purchase);

    logger.info('Purchase fulfilled', { purchaseId: purchase.id, stripePaymentIntentId });
    return purchase;
  });
}

/**
 * Mark a purchase as failed.
 */
async function failPurchase(stripePaymentIntentId, failureReason) {
  const result = await query(
    `UPDATE purchases SET payment_status = 'failed', failure_reason = $1, updated_at = NOW()
     WHERE stripe_payment_intent_id = $2
     RETURNING *`,
    [failureReason, stripePaymentIntentId]
  );

  if (result.rows.length > 0) {
    logger.info('Purchase marked failed', { stripePaymentIntentId, failureReason });
  }

  return result.rows[0] || null;
}

module.exports = {
  createPurchase,
  getUserPurchases,
  getPurchaseById,
  fulfillPurchase,
  failPurchase,
};
